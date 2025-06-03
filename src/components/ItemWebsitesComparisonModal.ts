import { App, Modal, Notice } from "obsidian";
import { ShoppingItem, Website } from "../models/ShoppingItem";
import BuyingListPlugin from "../../main";

export class ItemWebsitesComparisonModal extends Modal {
	plugin: BuyingListPlugin;
	item: ShoppingItem;

	constructor(app: App, plugin: BuyingListPlugin, item: ShoppingItem) {
		super(app);
		this.plugin = plugin;
		this.item = item;
	}

	onOpen() {
		const { contentEl, modalEl } = this;
		contentEl.empty();
		modalEl.addClass("item-websites-comparison-modal");

		this.createHeader();
		this.createWebsitesGrid();
		this.createFooter();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private createHeader(): void {
		const header = this.contentEl.createDiv("comparison-header");

		// Title
		const titleSection = header.createDiv("header-title-section");
		titleSection.createEl("h2", {
			text: `مقارنة المواقع - ${this.item.name}`,
			cls: "modal-title",
		});

		// Item info
		const itemInfo = header.createDiv("header-item-info");

		// Category
		const category = this.plugin.dataService.getCategoryById(
			this.item.categoryId
		);
		if (category) {
			itemInfo.createEl("span", {
				text: `${category.icon || "📁"} ${category.name}`,
				cls: "item-category-info",
			});
		}

		// Price comparison summary
		const priceComparison = this.plugin.priceService.getPriceComparison(
			this.item.id
		);
		if (priceComparison && priceComparison.websites.length > 1) {
			const savings = priceComparison.bestPrice.savings || 0;
			if (savings > 0) {
				itemInfo.createEl("div", {
					text: `💰 أفضل سعر يوفر ${savings.toFixed(2)} ر.س`,
					cls: "savings-summary",
				});
			}
		}

		// Actions
		const actionsSection = header.createDiv("header-actions");

		// Refresh all prices button
		const refreshAllBtn = actionsSection.createEl("button", {
			text: "🔄 تحديث جميع الأسعار",
			cls: "btn btn-success",
		});
		refreshAllBtn.onclick = () => this.refreshAllPrices();

		// Open all in browser button
		const openAllBtn = actionsSection.createEl("button", {
			text: "🔗 فتح الكل في متصفحات جديدة",
			cls: "btn btn-secondary",
		});
		openAllBtn.onclick = () => this.openAllInBrowser();
	}

	private createWebsitesGrid(): void {
		const gridContainer = this.contentEl.createDiv(
			"websites-grid-container"
		);

		if (this.item.websites.length === 0) {
			const emptyState = gridContainer.createDiv("empty-websites-state");
			emptyState.createEl("div", { text: "🌐", cls: "empty-icon" });
			emptyState.createEl("p", {
				text: "لا توجد مواقع مضافة لهذا العنصر",
			});

			const addWebsiteBtn = emptyState.createEl("button", {
				text: "+ إضافة موقع",
				cls: "btn btn-primary",
			});
			addWebsiteBtn.onclick = () => {
				this.close();
				// This would trigger adding a website - you'd need to implement this
				new Notice("يرجى إضافة موقع من القائمة الرئيسية");
			};
			return;
		}

		// Calculate grid layout based on number of websites
		const websiteCount = this.item.websites.length;
		const gridCols = Math.min(websiteCount, 3); // Max 3 columns
		const gridRows = Math.ceil(websiteCount / gridCols);

		const websitesGrid = gridContainer.createDiv("websites-grid");
		websitesGrid.style.gridTemplateColumns = `repeat(${gridCols}, 1fr)`;
		websitesGrid.style.gridTemplateRows = `repeat(${gridRows}, 1fr)`;

		this.item.websites.forEach((website, index) => {
			this.createWebsitePanel(websitesGrid, website, index);
		});
	}

	private createWebsitePanel(
		container: HTMLElement,
		website: Website,
		index: number
	): void {
		const panel = container.createDiv("website-panel");

		// Panel header
		const panelHeader = panel.createDiv("panel-header");

		// Website info
		const websiteInfo = panelHeader.createDiv("website-info");
		websiteInfo.createEl("h3", {
			text: website.name,
			cls: "website-name",
		});

		// URL preview
		const urlPreview = websiteInfo.createEl("div", {
			text: this.truncateUrl(website.url),
			cls: "website-url-preview",
		});

		// Price info
		const priceInfo = panelHeader.createDiv("price-info");
		if (website.currentPrice !== undefined) {
			const priceAmount = priceInfo.createEl("div", {
				text: `${website.currentPrice} ${website.currency}`,
				cls: "price-amount",
			});

			// Mark best price
			const priceComparison = this.plugin.priceService.getPriceComparison(
				this.item.id
			);
			if (priceComparison?.bestPrice.websiteId === website.id) {
				priceAmount.addClass("best-price");
				priceAmount.createEl("span", {
					text: " 🏆",
					cls: "best-price-icon",
				});
			}

			// Last updated
			if (website.lastUpdated) {
				const lastUpdated = new Date(
					website.lastUpdated
				).toLocaleDateString("ar-SA", {
					month: "short",
					day: "numeric",
					hour: "2-digit",
					minute: "2-digit",
				});
				priceInfo.createEl("div", {
					text: `آخر تحديث: ${lastUpdated}`,
					cls: "last-updated",
				});
			}
		} else {
			priceInfo.createEl("div", {
				text: "لم يتم تحديد السعر",
				cls: "no-price",
			});
		}

		// Panel actions
		const panelActions = panelHeader.createDiv("panel-actions");

		// Update price button
		const updateBtn = panelActions.createEl("button", {
			text: "🔄",
			cls: "action-btn",
			attr: { title: "تحديث السعر" },
		});
		updateBtn.onclick = () => this.updateWebsitePrice(website);

		// Open in new tab button
		const openBtn = panelActions.createEl("button", {
			text: "🔗",
			cls: "action-btn",
			attr: { title: "فتح في متصفح جديد" },
		});
		openBtn.onclick = () => window.open(website.url, "_blank");

		// Fullscreen button
		const fullscreenBtn = panelActions.createEl("button", {
			text: "⛶",
			cls: "action-btn",
			attr: { title: "عرض بملء الشاشة" },
		});
		fullscreenBtn.onclick = () => this.openWebsiteFullscreen(website);

		// Website content area
		const contentArea = panel.createDiv("website-content");

		// Status indicator
		const statusDiv = contentArea.createDiv("loading-status");
		statusDiv.textContent = "جاري التحميل...";

		// Create iframe
		try {
			const iframe = contentArea.createEl("iframe");
			iframe.setAttribute("src", website.url);
			iframe.setAttribute(
				"sandbox",
				"allow-same-origin allow-scripts allow-forms allow-popups"
			);
			iframe.style.width = "100%";
			iframe.style.height = "100%";
			iframe.style.border = "none";
			iframe.style.borderRadius = "8px";

			// Handle iframe load events
			iframe.onload = () => {
				statusDiv.style.display = "none";
				iframe.style.display = "block";
			};

			iframe.onerror = () => {
				statusDiv.textContent = "فشل في تحميل الموقع";
				statusDiv.addClass("error-status");
			};

			// Initially hide iframe until loaded
			iframe.style.display = "none";
		} catch (error) {
			statusDiv.textContent = "لا يمكن عرض هذا الموقع";
			statusDiv.addClass("error-status");
		}

		// Add panel number indicator
		const panelNumber = panel.createDiv("panel-number");
		panelNumber.textContent = `${index + 1}`;
	}

	private createFooter(): void {
		const footer = this.contentEl.createDiv("comparison-footer");

		// Statistics
		const stats = footer.createDiv("footer-stats");
		const websitesWithPrices = this.item.websites.filter(
			(w) => w.currentPrice !== undefined
		);

		stats.createEl("span", {
			text: `إجمالي المواقع: ${this.item.websites.length}`,
		});

		if (websitesWithPrices.length > 0) {
			const prices = websitesWithPrices.map((w) => w.currentPrice!);
			const avgPrice =
				prices.reduce((sum, price) => sum + price, 0) / prices.length;

			stats.createEl("span", {
				text: `متوسط السعر: ${avgPrice.toFixed(2)} ر.س`,
			});
		}

		// Footer actions
		const footerActions = footer.createDiv("footer-actions");

		// Close button
		const closeBtn = footerActions.createEl("button", {
			text: "إغلاق",
			cls: "btn btn-secondary",
		});
		closeBtn.onclick = () => this.close();

		// Edit item button
		const editBtn = footerActions.createEl("button", {
			text: "✏️ تعديل العنصر",
			cls: "btn btn-primary",
		});
		editBtn.onclick = () => {
			this.close();
			// You would need to trigger the edit modal from the main view
			new Notice("سيتم فتح نافذة التعديل...");
		};
	}

	private async refreshAllPrices(): Promise<void> {
		const notice = new Notice("جاري تحديث جميع الأسعار...", 0);

		try {
			const updatePromises = this.item.websites
				.filter((website) => website.isActive)
				.map((website) =>
					this.plugin.priceService.updateWebsitePrice(
						this.item.id,
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
					`تم تحديث ${successCount} من ${this.item.websites.length} أسعار بنجاح`
				);
				// Refresh the modal content
				this.onClose();
				this.onOpen();
			}

			if (errorCount > 0) {
				new Notice(`فشل في تحديث ${errorCount} أسعار`);
			}
		} catch (error) {
			notice.hide();
			new Notice("حدث خطأ أثناء تحديث الأسعار");
			console.error("Error refreshing all prices:", error);
		}
	}

	private async updateWebsitePrice(website: Website): Promise<void> {
		const notice = new Notice(`جاري تحديث سعر ${website.name}...`, 0);

		try {
			const result = await this.plugin.priceService.updateWebsitePrice(
				this.item.id,
				website.id
			);

			notice.hide();

			if (result.success) {
				new Notice(
					`تم تحديث سعر ${website.name}: ${result.price} ${website.currency}`
				);
				// Refresh the modal content
				this.onClose();
				this.onOpen();
			} else {
				new Notice(`فشل في تحديث سعر ${website.name}: ${result.error}`);
			}
		} catch (error) {
			notice.hide();
			new Notice(`حدث خطأ أثناء تحديث سعر ${website.name}`);
			console.error("Error updating website price:", error);
		}
	}

	private openAllInBrowser(): void {
		if (this.item.websites.length === 0) {
			new Notice("لا توجد مواقع لفتحها");
			return;
		}

		const maxTabs = 5; // Limit to prevent browser from blocking popups
		const websitesToOpen = this.item.websites.slice(0, maxTabs);

		if (this.item.websites.length > maxTabs) {
			new Notice(
				`سيتم فتح أول ${maxTabs} مواقع فقط لتجنب حظر النوافذ المنبثقة`
			);
		}

		websitesToOpen.forEach((website, index) => {
			setTimeout(() => {
				window.open(website.url, "_blank");
			}, index * 200); // Stagger opening to avoid popup blocking
		});
	}

	private openWebsiteFullscreen(website: Website): void {
		// Close current modal and open website in fullscreen modal
		this.close();

		// You would need to import and use the WebsiteEmbedModal
		const { WebsiteEmbedModal } = require("./WebsiteModals");
		new WebsiteEmbedModal(this.app, website).open();
	}

	private truncateUrl(url: string): string {
		try {
			const urlObj = new URL(url);
			let hostname = urlObj.hostname;

			// Remove www prefix
			if (hostname.startsWith("www.")) {
				hostname = hostname.substring(4);
			}

			// Truncate if too long
			if (hostname.length > 25) {
				return hostname.substring(0, 22) + "...";
			}

			return hostname;
		} catch {
			// Fallback for invalid URLs
			return url.length > 25 ? url.substring(0, 22) + "..." : url;
		}
	}
}
