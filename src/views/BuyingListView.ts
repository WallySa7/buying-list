import {
	ItemView,
	WorkspaceLeaf,
	Menu,
	Setting,
	Modal,
	Notice,
} from "obsidian";
import {
	ShoppingItem,
	Website,
	ItemFilterOptions,
	ItemSortOptions,
} from "../models/ShoppingItem";
import { Category } from "../models/Category";
import { AddItemModal } from "../components/AddItemModal";
import { EditItemModal } from "../components/EditItemModal";
import {
	AddCategoryModal,
	EditCategoryModal,
} from "../components/CategoryModals";
import { SettingsModal } from "../components/SettingsModal";
import {
	AddWebsiteModal,
	WebsiteEmbedModal,
} from "../components/WebsiteModals";
import BuyingListPlugin from "../../main";

export const VIEW_TYPE_BUYING_LIST = "buying-list-view";

export class BuyingListView extends ItemView {
	plugin: BuyingListPlugin;
	public contentEl: HTMLElement;
	private currentFilter: ItemFilterOptions = {};
	private currentSort: ItemSortOptions = { field: "order", direction: "asc" };
	private selectedCategory: string | null = null;
	private searchTerm: string = "";

	constructor(leaf: WorkspaceLeaf, plugin: BuyingListPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string {
		return VIEW_TYPE_BUYING_LIST;
	}

	getDisplayText(): string {
		return "قائمة التسوق";
	}

	getIcon(): string {
		return "shopping-cart";
	}

	async onOpen() {
		this.contentEl = this.containerEl.children[1] as HTMLElement;
		this.contentEl.empty();
		this.contentEl.addClass("buying-list-view");

		this.buildView();
	}

	async onClose() {
		// Cleanup if needed
	}

	private buildView(): void {
		this.contentEl.empty();

		// Create main layout
		const mainContainer = this.contentEl.createDiv("buying-list-main");

		// Header
		this.createHeader(mainContainer);

		// Content area
		const contentArea = mainContainer.createDiv("buying-list-content");

		// Sidebar
		this.createSidebar(contentArea);

		// Main area
		this.createMainArea(contentArea);
	}

	private createHeader(container: HTMLElement): void {
		const header = container.createDiv("buying-list-header");

		// Title and actions
		const titleSection = header.createDiv("header-title-section");
		titleSection.createEl("h1", {
			text: "قائمة التسوق الذكية",
			cls: "buying-list-title",
		});

		const actionsSection = header.createDiv("header-actions");

		// Add item button
		const addButton = actionsSection.createEl("button", {
			text: "+ إضافة عنصر",
			cls: "mod-cta",
		});
		addButton.onclick = () => this.openAddItemModal();

		// Settings button
		const settingsButton = actionsSection.createEl("button", {
			text: "⚙️ الإعدادات",
			cls: "settings-button",
		});
		settingsButton.onclick = () => this.openSettingsModal();

		// Search bar
		const searchSection = header.createDiv("header-search");
		const searchInput = searchSection.createEl("input", {
			type: "text",
			placeholder: "البحث في العناصر...",
			cls: "search-input",
		});
		searchInput.value = this.searchTerm;
		searchInput.onkeyup = (e) => {
			this.searchTerm = (e.target as HTMLInputElement).value;
			this.updateItemsList();
		};

		// Filter and sort controls
		const controlsSection = header.createDiv("header-controls");
		this.createFilterControls(controlsSection);
		this.createSortControls(controlsSection);
	}

	private createFilterControls(container: HTMLElement): void {
		const filterSection = container.createDiv("filter-controls");

		// Status filter
		const statusFilter = filterSection.createDiv("filter-group");
		statusFilter.createEl("label", { text: "الحالة:" });
		const statusSelect = statusFilter.createEl("select");
		statusSelect.createEl("option", { text: "جميع الحالات", value: "" });
		statusSelect.createEl("option", {
			text: "قائمة الأمنيات",
			value: "wishlist",
		});
		statusSelect.createEl("option", { text: "مطلوب", value: "needed" });
		statusSelect.createEl("option", {
			text: "تم الشراء",
			value: "purchased",
		});

		statusSelect.onchange = () => {
			const value = statusSelect.value;
			this.currentFilter.status = value ? [value] : undefined;
			this.updateItemsList();
		};

		// Priority filter
		const priorityFilter = filterSection.createDiv("filter-group");
		priorityFilter.createEl("label", { text: "الأولوية:" });
		const prioritySelect = priorityFilter.createEl("select");
		prioritySelect.createEl("option", {
			text: "جميع الأولويات",
			value: "",
		});
		prioritySelect.createEl("option", { text: "عالية", value: "high" });
		prioritySelect.createEl("option", { text: "متوسطة", value: "medium" });
		prioritySelect.createEl("option", { text: "منخفضة", value: "low" });

		prioritySelect.onchange = () => {
			const value = prioritySelect.value;
			this.currentFilter.priority = value ? [value] : undefined;
			this.updateItemsList();
		};
	}

	private createSortControls(container: HTMLElement): void {
		const sortSection = container.createDiv("sort-controls");

		// Sort field
		const sortFieldSelect = sortSection.createEl("select");
		sortFieldSelect.createEl("option", {
			text: "ترتيب مخصص",
			value: "order",
		});
		sortFieldSelect.createEl("option", { text: "الاسم", value: "name" });
		sortFieldSelect.createEl("option", { text: "السعر", value: "price" });
		sortFieldSelect.createEl("option", {
			text: "الأولوية",
			value: "priority",
		});
		sortFieldSelect.createEl("option", {
			text: "تاريخ الإضافة",
			value: "dateAdded",
		});
		sortFieldSelect.createEl("option", {
			text: "الفئة",
			value: "category",
		});

		// Sort direction
		const sortDirectionSelect = sortSection.createEl("select");
		sortDirectionSelect.createEl("option", {
			text: "تصاعدي",
			value: "asc",
		});
		sortDirectionSelect.createEl("option", {
			text: "تنازلي",
			value: "desc",
		});

		const updateSort = () => {
			this.currentSort = {
				field: sortFieldSelect.value as any,
				direction: sortDirectionSelect.value as "asc" | "desc",
			};
			this.updateItemsList();
		};

		sortFieldSelect.onchange = updateSort;
		sortDirectionSelect.onchange = updateSort;
	}

	private createSidebar(container: HTMLElement): void {
		const sidebar = container.createDiv("buying-list-sidebar");

		// Categories section
		const categoriesSection = sidebar.createDiv("sidebar-section");
		const categoriesHeader = categoriesSection.createDiv("sidebar-header");
		categoriesHeader.createEl("h3", { text: "الفئات" });

		const addCategoryButton = categoriesHeader.createEl("button", {
			text: "+",
			cls: "add-category-btn",
		});
		addCategoryButton.onclick = () => this.openAddCategoryModal();

		const categoriesList = categoriesSection.createDiv("categories-list");
		this.updateCategoriesList(categoriesList);

		// Statistics section
		const statsSection = sidebar.createDiv("sidebar-section");
		statsSection.createEl("h3", { text: "الإحصائيات" });
		this.updateStatistics(statsSection);
	}

	private createMainArea(container: HTMLElement): void {
		const mainArea = container.createDiv("buying-list-main-area");

		// Items list
		const itemsContainer = mainArea.createDiv("items-container");
		this.updateItemsList(itemsContainer);
	}

	private updateCategoriesList(container: HTMLElement): void {
		container.empty();

		const categories = this.plugin.dataService.getCategories();

		// All items option
		const allItemsDiv = container.createDiv("category-item");
		if (!this.selectedCategory) allItemsDiv.addClass("active");
		allItemsDiv.createEl("span", { text: `📂 جميع العناصر` });
		allItemsDiv.onclick = () => {
			this.selectedCategory = null;
			this.currentFilter.categoryIds = undefined;
			this.updateItemsList();
			this.updateCategoriesList(container);
		};

		// Individual categories
		categories.forEach((category) => {
			const categoryDiv = container.createDiv("category-item");
			if (this.selectedCategory === category.id)
				categoryDiv.addClass("active");

			const categoryContent = categoryDiv.createDiv("category-content");
			categoryContent.createEl("span", {
				text: `${category.icon || "📁"} ${category.name}`,
				cls: "category-name",
			});

			// Item count
			const itemCount = this.plugin.dataService.getItems({
				categoryIds: [category.id],
			}).length;
			categoryContent.createEl("span", {
				text: `(${itemCount})`,
				cls: "category-count",
			});

			categoryDiv.onclick = () => {
				this.selectedCategory = category.id;
				this.currentFilter.categoryIds = [category.id];
				this.updateItemsList();
				this.updateCategoriesList(container);
			};

			// Context menu for category management
			if (!category.isDefault) {
				categoryDiv.oncontextmenu = (e) => {
					e.preventDefault();
					const menu = new Menu();
					menu.addItem((item) => {
						item.setTitle("تعديل الفئة")
							.setIcon("edit")
							.onClick(() =>
								this.openEditCategoryModal(category)
							);
					});
					menu.addItem((item) => {
						item.setTitle("حذف الفئة")
							.setIcon("trash")
							.onClick(() => this.deleteCategory(category.id));
					});
					menu.showAtMouseEvent(e);
				};
			}
		});
	}

	private updateStatistics(container: HTMLElement): void {
		const items = this.plugin.dataService.getItems(this.currentFilter);
		const totalItems = items.length;
		const totalValue = items.reduce((sum, item) => {
			const prices = item.websites
				.filter((w) => w.currentPrice !== undefined)
				.map((w) => w.currentPrice!);
			return sum + (prices.length > 0 ? Math.min(...prices) : 0);
		}, 0);

		const statusCounts = {
			wishlist: items.filter((i) => i.status === "wishlist").length,
			needed: items.filter((i) => i.status === "needed").length,
			purchased: items.filter((i) => i.status === "purchased").length,
		};

		container.empty();

		const statsDiv = container.createDiv("statistics");
		statsDiv.createEl("div", { text: `إجمالي العناصر: ${totalItems}` });
		statsDiv.createEl("div", {
			text: `القيمة المقدرة: ${totalValue.toFixed(2)} ر.س`,
		});
		statsDiv.createEl("div", {
			text: `قائمة الأمنيات: ${statusCounts.wishlist}`,
		});
		statsDiv.createEl("div", { text: `مطلوب: ${statusCounts.needed}` });
		statsDiv.createEl("div", {
			text: `تم الشراء: ${statusCounts.purchased}`,
		});
	}

	private updateItemsList(container?: HTMLElement): void {
		if (!container) {
			container = this.contentEl.querySelector(
				".items-container"
			) as HTMLElement;
		}
		if (!container) return;

		container.empty();

		// Apply search filter
		if (this.searchTerm) {
			this.currentFilter.searchTerm = this.searchTerm;
		} else {
			delete this.currentFilter.searchTerm;
		}

		const items = this.plugin.dataService.getItems(
			this.currentFilter,
			this.currentSort
		);

		if (items.length === 0) {
			container.createDiv("empty-state").createEl("p", {
				text: "لا توجد عناصر لعرضها",
			});
			return;
		}

		const itemsList = container.createDiv("items-list");

		items.forEach((item) => {
			this.createItemCard(itemsList, item);
		});
	}

	private createItemCard(container: HTMLElement, item: ShoppingItem): void {
		const itemCard = container.createDiv("item-card");
		itemCard.setAttribute("data-item-id", item.id);

		// Item header
		const itemHeader = itemCard.createDiv("item-header");

		// Status indicator
		const statusIndicator = itemHeader.createDiv(
			`status-indicator status-${item.status}`
		);

		// Item info
		const itemInfo = itemHeader.createDiv("item-info");
		itemInfo.createEl("h3", { text: item.name, cls: "item-title" });

		// Category
		const category = this.plugin.dataService.getCategoryById(
			item.categoryId
		);
		if (category) {
			itemInfo.createEl("span", {
				text: `${category.icon || "📁"} ${category.name}`,
				cls: "item-category",
			});
		}

		// Priority indicator
		const priorityColors = {
			high: "#ef4444",
			medium: "#f59e0b",
			low: "#10b981",
		};
		const priorityTexts = {
			high: "عالية",
			medium: "متوسطة",
			low: "منخفضة",
		};
		itemHeader.createEl("span", {
			text: priorityTexts[item.priority],
			cls: `priority-badge priority-${item.priority}`,
		});

		// Item actions
		const itemActions = itemHeader.createDiv("item-actions");

		// Edit button
		const editButton = itemActions.createEl("button", {
			text: "✏️",
			cls: "item-action-btn",
		});
		editButton.onclick = () => this.openEditItemModal(item);

		// Delete button
		const deleteButton = itemActions.createEl("button", {
			text: "🗑️",
			cls: "item-action-btn",
		});
		deleteButton.onclick = () => this.deleteItem(item.id);

		// Item body
		const itemBody = itemCard.createDiv("item-body");

		// Description
		if (item.description) {
			itemBody.createEl("p", {
				text: item.description,
				cls: "item-description",
			});
		}

		// Websites and prices
		if (item.websites.length > 0) {
			const websitesSection = itemBody.createDiv("item-websites");
			this.createWebsitesSection(websitesSection, item);
		}

		// Price comparison
		const priceComparison = this.plugin.priceService.getPriceComparison(
			item.id
		);
		if (priceComparison) {
			this.createPriceComparisonSection(itemBody, priceComparison);
		}

		// Tags
		if (item.tags.length > 0) {
			const tagsSection = itemBody.createDiv("item-tags");
			item.tags.forEach((tag) => {
				tagsSection.createEl("span", { text: tag, cls: "tag" });
			});
		}

		// Notes
		if (item.notes) {
			itemBody.createEl("p", { text: item.notes, cls: "item-notes" });
		}
	}

	private createWebsitesSection(
		container: HTMLElement,
		item: ShoppingItem
	): void {
		container.empty();

		const websitesHeader = container.createDiv("websites-header");
		websitesHeader.createEl("h4", { text: "المواقع والأسعار" });

		const addWebsiteButton = websitesHeader.createEl("button", {
			text: "+ موقع",
			cls: "add-website-btn",
		});
		addWebsiteButton.onclick = () => this.openAddWebsiteModal(item.id);

		const websitesList = container.createDiv("websites-list");

		item.websites.forEach((website) => {
			const websiteItem = websitesList.createDiv("website-item");

			// Website name and URL
			const websiteInfo = websiteItem.createDiv("website-info");
			websiteInfo.createEl("span", {
				text: website.name,
				cls: "website-name",
			});

			// Price
			const priceSection = websiteItem.createDiv("website-price");
			if (website.currentPrice !== undefined) {
				priceSection.createEl("span", {
					text: `${website.currentPrice} ${website.currency}`,
					cls: "price-amount",
				});

				// Last updated
				if (website.lastUpdated) {
					const lastUpdated = new Date(
						website.lastUpdated
					).toLocaleDateString("ar-SA");
					priceSection.createEl("span", {
						text: `آخر تحديث: ${lastUpdated}`,
						cls: "last-updated",
					});
				}
			} else {
				priceSection.createEl("span", {
					text: "لم يتم تحديد السعر",
					cls: "no-price",
				});
			}

			// Website actions
			const websiteActions = websiteItem.createDiv("website-actions");

			// View website button (embed)
			const viewButton = websiteActions.createEl("button", {
				text: "👁️",
			});
			viewButton.onclick = () => this.openWebsiteEmbed(website);

			// Update price button
			const updateButton = websiteActions.createEl("button", {
				text: "🔄",
			});
			updateButton.onclick = () =>
				this.updateWebsitePrice(item.id, website.id);

			// Remove website button
			const removeButton = websiteActions.createEl("button", {
				text: "❌",
			});
			removeButton.onclick = () =>
				this.removeWebsite(item.id, website.id);
		});
	}

	private createPriceComparisonSection(
		container: HTMLElement,
		comparison: any
	): void {
		const comparisonSection = container.createDiv("price-comparison");
		comparisonSection.createEl("h4", { text: "مقارنة الأسعار" });

		if (comparison.websites.length > 1) {
			const bestPrice = comparison.bestPrice;
			const savings = bestPrice.savings || 0;

			if (savings > 0) {
				comparisonSection.createEl("p", {
					text: `💰 أفضل سعر يوفر لك ${savings.toFixed(2)} ر.س`,
					cls: "savings-info",
				});
			}
		}

		// Price chart
		const chartContainer = comparisonSection.createDiv("price-chart");
		this.createPriceChart(chartContainer, comparison.itemId);
	}

	private createPriceChart(container: HTMLElement, itemId: string): void {
		// Simplified price history visualization
		const priceHistory = this.plugin.priceService.getPriceHistory(
			itemId,
			undefined,
			30
		);

		if (priceHistory.length < 2) {
			container.createEl("p", {
				text: "بيانات غير كافية لعرض الرسم البياني",
			});
			return;
		}

		// Create simple SVG chart
		const svg = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"svg"
		);
		svg.setAttribute("width", "100%");
		svg.setAttribute("height", "200");
		svg.setAttribute("viewBox", "0 0 400 200");

		// Calculate chart points
		const prices = priceHistory.map((entry) => entry.price);
		const minPrice = Math.min(...prices);
		const maxPrice = Math.max(...prices);
		const priceRange = maxPrice - minPrice || 1;

		const points = priceHistory
			.map((entry, index) => {
				const x = (index / (priceHistory.length - 1)) * 380 + 10;
				const y = 190 - ((entry.price - minPrice) / priceRange) * 180;
				return `${x},${y}`;
			})
			.join(" ");

		// Create polyline
		const polyline = svg.ownerDocument.createElementNS(
			"http://www.w3.org/2000/svg",
			"polyline"
		);
		polyline.setAttribute("points", points);
		polyline.setAttribute("fill", "none");
		polyline.setAttribute("stroke", "#3b82f6");
		polyline.setAttribute("stroke-width", "2");

		svg.appendChild(polyline);
	}

	// Modal functions will be implemented in the next part...
	private openAddItemModal(): void {
		new AddItemModal(this.app, this.plugin, (item) => {
			this.plugin.dataService.addItem(item).then(() => {
				this.updateItemsList();
				this.updateStatistics(
					this.contentEl.querySelector(
						".sidebar-section:nth-child(2)"
					) as HTMLElement
				);
			});
		}).open();
	}

	private openEditItemModal(item: ShoppingItem): void {
		new EditItemModal(this.app, this.plugin, item, () => {
			this.updateItemsList();
		}).open();
	}

	private openAddCategoryModal(): void {
		new AddCategoryModal(this.app, this.plugin, () => {
			this.updateCategoriesList(
				this.contentEl.querySelector(".categories-list") as HTMLElement
			);
		}).open();
	}

	private openEditCategoryModal(category: Category): void {
		new EditCategoryModal(this.app, this.plugin, category, () => {
			this.updateCategoriesList(
				this.contentEl.querySelector(".categories-list") as HTMLElement
			);
		}).open();
	}

	private openSettingsModal(): void {
		new SettingsModal(this.app, this.plugin).open();
	}

	private openAddWebsiteModal(itemId: string): void {
		new AddWebsiteModal(this.app, this.plugin, itemId, () => {
			this.updateItemsList();
		}).open();
	}

	private openWebsiteEmbed(website: Website): void {
		new WebsiteEmbedModal(this.app, website).open();
	}

	private async updateWebsitePrice(
		itemId: string,
		websiteId: string
	): Promise<void> {
		const notice = new Notice("جاري تحديث السعر...", 0);
		try {
			const result = await this.plugin.priceService.updateWebsitePrice(
				itemId,
				websiteId
			);
			notice.hide();

			if (result.success) {
				new Notice(`تم تحديث السعر: ${result.price} ر.س`);
				this.updateItemsList();
			} else {
				new Notice(`فشل في تحديث السعر: ${result.error}`);
			}
		} catch (error) {
			notice.hide();
			new Notice("حدث خطأ أثناء تحديث السعر");
		}
	}

	private async removeWebsite(
		itemId: string,
		websiteId: string
	): Promise<void> {
		const item = this.plugin.dataService.getItemById(itemId);
		if (!item) return;

		item.websites = item.websites.filter((w) => w.id !== websiteId);
		await this.plugin.dataService.updateItem(itemId, {
			websites: item.websites,
		});
		this.updateItemsList();
	}

	private async deleteItem(itemId: string): Promise<void> {
		if (confirm("هل أنت متأكد من حذف هذا العنصر؟")) {
			await this.plugin.dataService.deleteItem(itemId);
			this.updateItemsList();
			this.updateStatistics(
				this.contentEl.querySelector(
					".sidebar-section:nth-child(2)"
				) as HTMLElement
			);
		}
	}

	private async deleteCategory(categoryId: string): Promise<void> {
		await this.plugin.dataService.deleteCategory(categoryId);
		this.updateCategoriesList(
			this.contentEl.querySelector(".categories-list") as HTMLElement
		);
	}
}

// Modal classes will be defined in separate files...
