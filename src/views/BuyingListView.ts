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
import { ItemWebsitesComparisonModal } from "src/components/ItemWebsitesComparisonModal";

export const VIEW_TYPE_BUYING_LIST = "buying-list-view";

export class BuyingListView extends ItemView {
	plugin: BuyingListPlugin;
	public contentEl: HTMLElement;
	private currentFilter: ItemFilterOptions = {};
	private currentSort: ItemSortOptions = { field: "order", direction: "asc" };
	private selectedCategory: string | null = null;
	private searchTerm: string = "";
	private isRefreshing: boolean = false;
	private refreshingItems: Set<string> = new Set();

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
			cls: "btn btn-primary",
		});
		addButton.onclick = () => this.openAddItemModal();

		// Global refresh all prices button
		const globalRefreshButton = actionsSection.createEl("button", {
			text: "🔄 تحديث جميع الأسعار",
			cls: "btn btn-success global-refresh-btn",
		});
		globalRefreshButton.onclick = () => this.refreshAllPrices();

		// Settings button
		const settingsButton = actionsSection.createEl("button", {
			text: "⚙️ الإعدادات",
			cls: "btn btn-secondary",
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

		// Add refresh status if currently refreshing
		if (this.isRefreshing) {
			const refreshStatus = statsDiv.createEl("div", {
				text: "🔄 جاري تحديث الأسعار...",
				cls: "refresh-status",
			});
			refreshStatus.style.color = "var(--interactive-accent)";
			refreshStatus.style.fontWeight = "600";
		}
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
			const emptyState = container.createDiv("empty-state");
			emptyState.createDiv("empty-state-icon").setText("🛍️");
			emptyState.createEl("p", {
				text: "لا توجد عناصر لعرضها",
			});
			const addFirstItemBtn = emptyState.createEl("button", {
				text: "إضافة أول عنصر",
				cls: "btn btn-primary",
			});
			addFirstItemBtn.onclick = () => this.openAddItemModal();
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

		// Refresh all prices for this item button
		const refreshItemButton = itemActions.createEl("button", {
			text: "🔄 تحديث الأسعار",
			cls: "btn btn-success refresh-all-prices-btn",
		});

		const isItemRefreshing = this.refreshingItems.has(item.id);
		if (isItemRefreshing) {
			refreshItemButton.addClass("btn-loading");
			refreshItemButton.disabled = true;
			refreshItemButton.textContent = "جاري التحديث...";
		}

		refreshItemButton.onclick = () => this.refreshItemPrices(item.id);

		// Edit button
		const editButton = itemActions.createEl("button", {
			text: "✏️",
			cls: "item-action-btn",
			attr: { title: "تعديل العنصر" },
		});
		editButton.onclick = () => this.openEditItemModal(item);

		// Delete button
		const deleteButton = itemActions.createEl("button", {
			text: "🗑️",
			cls: "item-action-btn",
			attr: { title: "حذف العنصر" },
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

		// Buying recommendation
		const recommendation = this.plugin.priceService.getBuyingRecommendation(
			item.id
		);
		if (recommendation && item.websites.length > 0) {
			this.createRecommendationSection(itemBody, recommendation);
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

	private openWebsitesComparison(item: ShoppingItem): void {
		new ItemWebsitesComparisonModal(this.app, this.plugin, item).open();
	}

	private createWebsitesSection(
		container: HTMLElement,
		item: ShoppingItem
	): void {
		container.empty();

		const websitesHeader = container.createDiv("websites-header");
		websitesHeader.createEl("h4", { text: "المواقع والأسعار" });

		const headerActions = websitesHeader.createDiv("header-actions");

		// Compare all websites button (NEW)
		if (item.websites.length > 1) {
			const compareAllButton = headerActions.createEl("button", {
				text: "🔍 مقارنة",
				cls: "compare-all-btn",
				attr: { title: "عرض جميع المواقع جنباً إلى جنب" },
			});
			compareAllButton.onclick = () => this.openWebsitesComparison(item);
		}

		const addWebsiteButton = headerActions.createEl("button", {
			text: "+ موقع",
			cls: "add-website-btn",
		});
		addWebsiteButton.onclick = () => this.openAddWebsiteModal(item.id);

		const websitesList = container.createDiv("websites-list");

		item.websites.forEach((website) => {
			const websiteItem = websitesList.createDiv("website-item");

			// Website info
			const websiteInfo = websiteItem.createDiv("website-info");
			websiteInfo.createEl("span", {
				text: website.name,
				cls: "website-name",
			});

			// Add URL preview
			const urlPreview = websiteInfo.createEl("div", {
				text: this.truncateUrl(website.url),
				cls: "website-url",
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
					).toLocaleDateString("ar-SA", {
						year: "numeric",
						month: "short",
						day: "numeric",
						hour: "2-digit",
						minute: "2-digit",
					});
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
				attr: { title: "عرض الموقع" },
			});
			viewButton.onclick = () => this.openWebsiteEmbed(website);

			// Update price button
			const updateButton = websiteActions.createEl("button", {
				text: "🔄",
				attr: { title: "تحديث السعر" },
			});
			updateButton.onclick = () =>
				this.updateWebsitePrice(item.id, website.id);

			// Open in browser button
			const openButton = websiteActions.createEl("button", {
				text: "🔗",
				attr: { title: "فتح في متصفح جديد" },
			});
			openButton.onclick = () => window.open(website.url, "_blank");

			// Remove website button
			const removeButton = websiteActions.createEl("button", {
				text: "❌",
				attr: { title: "إزالة الموقع" },
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

			// Create comparison table
			const comparisonTable =
				comparisonSection.createDiv("comparison-table");
			comparison.websites.forEach((website: any, index: number) => {
				const row = comparisonTable.createDiv("comparison-row");

				if (index === 0) {
					row.addClass("best-price");
				}

				row.createEl("span", {
					text: website.name,
					cls: "website-name-comp",
				});

				row.createEl("span", {
					text: `${website.price} ${website.currency}`,
					cls: "website-price-comp",
				});

				if (index === 0) {
					row.createEl("span", {
						text: "🏆 أفضل سعر",
						cls: "best-price-badge",
					});
				}
			});
		}

		// Price chart
		const chartContainer = comparisonSection.createDiv("price-chart");
		this.createPriceChart(chartContainer, comparison.itemId);
	}

	private createRecommendationSection(
		container: HTMLElement,
		recommendation: any
	): void {
		const recSection = container.createDiv("recommendation-section");
		recSection.createEl("h4", { text: "توصية الشراء" });

		const recCard = recSection.createDiv(
			`recommendation-card rec-${recommendation.recommendation}`
		);

		const recIcon = {
			buy: "✅",
			wait: "⏳",
			uncertain: "❓",
		}[recommendation.recommendation as "buy" | "wait" | "uncertain"];

		const recText = {
			buy: "ينصح بالشراء الآن",
			wait: "انتظر لسعر أفضل",
			uncertain: "غير محدد",
		}[recommendation.recommendation as "buy" | "wait" | "uncertain"];

		recCard.createEl("div", {
			text: `${recIcon} ${recText}`,
			cls: "recommendation-title",
		});

		recCard.createEl("div", {
			text: recommendation.reason,
			cls: "recommendation-reason",
		});

		recCard.createEl("div", {
			text: `مستوى الثقة: ${recommendation.confidence}%`,
			cls: "recommendation-confidence",
		});

		if (recommendation.bestWebsite) {
			recCard.createEl("div", {
				text: `أفضل موقع: ${recommendation.bestWebsite}`,
				cls: "recommendation-website",
			});
		}
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
				cls: "chart-no-data",
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
		polyline.setAttribute("stroke", "#667eea");
		polyline.setAttribute("stroke-width", "2");

		svg.appendChild(polyline);
		container.appendChild(svg);
	}

	private truncateUrl(url: string): string {
		try {
			const urlObj = new URL(url);
			const hostname = urlObj.hostname;
			if (hostname.length > 30) {
				return hostname.substring(0, 27) + "...";
			}
			return hostname;
		} catch {
			return url.length > 30 ? url.substring(0, 27) + "..." : url;
		}
	}

	// Enhanced refresh functionality
	private async refreshAllPrices(): Promise<void> {
		if (this.isRefreshing) {
			new Notice("تحديث الأسعار قيد التقدم بالفعل");
			return;
		}

		this.isRefreshing = true;

		// Update UI to show refreshing state
		const globalRefreshBtn = this.contentEl.querySelector(
			".global-refresh-btn"
		) as HTMLButtonElement;
		if (globalRefreshBtn) {
			globalRefreshBtn.addClass("refreshing");
			globalRefreshBtn.textContent = "🔄 جاري التحديث...";
			globalRefreshBtn.disabled = true;
		}

		const notice = new Notice("بدء تحديث جميع الأسعار...", 0);

		try {
			await this.plugin.priceService.updateAllPrices();
			notice.hide();
			new Notice("تم تحديث جميع الأسعار بنجاح");

			// Refresh the view
			this.updateItemsList();
			this.updateStatistics(
				this.contentEl.querySelector(
					".sidebar-section:nth-child(2)"
				) as HTMLElement
			);
		} catch (error) {
			notice.hide();
			new Notice("حدث خطأ أثناء تحديث الأسعار");
			console.error("Error refreshing all prices:", error);
		} finally {
			this.isRefreshing = false;

			// Reset button state
			if (globalRefreshBtn) {
				globalRefreshBtn.removeClass("refreshing");
				globalRefreshBtn.textContent = "🔄 تحديث جميع الأسعار";
				globalRefreshBtn.disabled = false;
			}
		}
	}

	private async refreshItemPrices(itemId: string): Promise<void> {
		if (this.refreshingItems.has(itemId)) {
			return;
		}

		const item = this.plugin.dataService.getItemById(itemId);
		if (!item || item.websites.length === 0) {
			new Notice("لا توجد مواقع لتحديث أسعارها");
			return;
		}

		this.refreshingItems.add(itemId);

		// Update UI to show loading state
		this.updateItemsList();

		const notice = new Notice(`جاري تحديث أسعار: ${item.name}...`, 0);

		try {
			const updatePromises = item.websites
				.filter((website) => website.isActive)
				.map((website) =>
					this.plugin.priceService.updateWebsitePrice(
						item.id,
						website.id
					)
				);

			const results = await Promise.allSettled(updatePromises);

			let successCount = 0;
			let errorCount = 0;

			results.forEach((result) => {
				if (result.status === "fulfilled" && result.value.success) {
					successCount++;
				} else {
					errorCount++;
				}
			});

			notice.hide();

			if (successCount > 0) {
				new Notice(
					`تم تحديث ${successCount} من ${item.websites.length} أسعار بنجاح`
				);
			}

			if (errorCount > 0) {
				new Notice(`فشل في تحديث ${errorCount} أسعار`);
			}

			// Refresh the view
			this.updateItemsList();
			this.updateStatistics(
				this.contentEl.querySelector(
					".sidebar-section:nth-child(2)"
				) as HTMLElement
			);
		} catch (error) {
			notice.hide();
			new Notice(`حدث خطأ أثناء تحديث أسعار: ${item.name}`);
			console.error("Error refreshing item prices:", error);
		} finally {
			this.refreshingItems.delete(itemId);

			// Update UI to remove loading state
			this.updateItemsList();
		}
	}

	// Modal functions
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

		const website = item.websites.find((w) => w.id === websiteId);
		const websiteName = website?.name || "الموقع";

		if (confirm(`هل أنت متأكد من إزالة موقع "${websiteName}"؟`)) {
			item.websites = item.websites.filter((w) => w.id !== websiteId);
			await this.plugin.dataService.updateItem(itemId, {
				websites: item.websites,
			});
			this.updateItemsList();
			new Notice(`تم إزالة موقع "${websiteName}"`);
		}
	}

	private async deleteItem(itemId: string): Promise<void> {
		const item = this.plugin.dataService.getItemById(itemId);
		const itemName = item?.name || "العنصر";

		if (confirm(`هل أنت متأكد من حذف "${itemName}"؟`)) {
			await this.plugin.dataService.deleteItem(itemId);
			this.updateItemsList();
			this.updateStatistics(
				this.contentEl.querySelector(
					".sidebar-section:nth-child(2)"
				) as HTMLElement
			);
			new Notice(`تم حذف "${itemName}"`);
		}
	}

	private async deleteCategory(categoryId: string): Promise<void> {
		const category = this.plugin.dataService.getCategoryById(categoryId);
		const categoryName = category?.name || "الفئة";

		if (confirm(`هل أنت متأكد من حذف فئة "${categoryName}"؟`)) {
			await this.plugin.dataService.deleteCategory(categoryId);
			this.updateCategoriesList(
				this.contentEl.querySelector(".categories-list") as HTMLElement
			);
			new Notice(`تم حذف فئة "${categoryName}"`);
		}
	}
}
