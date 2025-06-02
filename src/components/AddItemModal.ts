import { App, Modal, Setting, Notice } from "obsidian";
import { ShoppingItem, Website } from "../models/ShoppingItem";
import { Category } from "../models/Category";
import BuyingListPlugin from "../../main";

export class AddItemModal extends Modal {
	plugin: BuyingListPlugin;
	onSubmit: (
		item: Omit<ShoppingItem, "id" | "dateAdded" | "dateModified" | "order">
	) => void;

	private formData: Partial<ShoppingItem> = {
		name: "",
		description: "",
		categoryId: "",
		websites: [],
		priceHistory: [],
		alerts: [],
		priority: "medium",
		status: "wishlist",
		tags: [],
		notes: "",
		quantity: 1,
	};

	constructor(
		app: App,
		plugin: BuyingListPlugin,
		onSubmit: (
			item: Omit<
				ShoppingItem,
				"id" | "dateAdded" | "dateModified" | "order"
			>
		) => void
	) {
		super(app);
		this.plugin = plugin;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("buying-list-modal");

		contentEl.createEl("h2", {
			text: "إضافة عنصر جديد",
			cls: "modal-title",
		});

		this.createForm();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private createForm() {
		const { contentEl } = this;
		const form = contentEl.createDiv("modal-content");

		// Item name
		new Setting(form)
			.setName("اسم العنصر")
			.setDesc("اسم المنتج أو العنصر المراد شراؤه")
			.addText((text) => {
				text.setPlaceholder("مثال: iPhone 15 Pro")
					.setValue(this.formData.name || "")
					.onChange((value) => {
						this.formData.name = value;
					});
				text.inputEl.focus();
			});

		// Description
		new Setting(form)
			.setName("الوصف")
			.setDesc("وصف مفصل للعنصر (اختياري)")
			.addTextArea((text) => {
				text.setPlaceholder(
					"وصف العنصر، المواصفات، أو أي تفاصيل أخرى..."
				)
					.setValue(this.formData.description || "")
					.onChange((value) => {
						this.formData.description = value;
					});
				text.inputEl.rows = 3;
			});

		// Category
		const categories = this.plugin.dataService.getCategories();
		new Setting(form)
			.setName("الفئة")
			.setDesc("اختر فئة العنصر")
			.addDropdown((dropdown) => {
				categories.forEach((category) => {
					dropdown.addOption(
						category.id,
						`${category.icon || "📁"} ${category.name}`
					);
				});

				if (categories.length > 0) {
					this.formData.categoryId = categories[0].id;
					dropdown.setValue(categories[0].id);
				}

				dropdown.onChange((value) => {
					this.formData.categoryId = value;
				});
			});

		// Priority
		new Setting(form)
			.setName("الأولوية")
			.setDesc("مستوى أولوية العنصر")
			.addDropdown((dropdown) => {
				dropdown.addOption("low", "منخفضة");
				dropdown.addOption("medium", "متوسطة");
				dropdown.addOption("high", "عالية");
				dropdown.setValue(this.formData.priority || "medium");
				dropdown.onChange((value) => {
					this.formData.priority = value as "low" | "medium" | "high";
				});
			});

		// Status
		new Setting(form)
			.setName("الحالة")
			.setDesc("حالة العنصر الحالية")
			.addDropdown((dropdown) => {
				dropdown.addOption("wishlist", "قائمة الأمنيات");
				dropdown.addOption("needed", "مطلوب");
				dropdown.addOption("purchased", "تم الشراء");
				dropdown.setValue(this.formData.status || "wishlist");
				dropdown.onChange((value) => {
					this.formData.status = value as
						| "wishlist"
						| "needed"
						| "purchased";
				});
			});

		// Quantity
		new Setting(form)
			.setName("الكمية")
			.setDesc("عدد القطع المطلوبة")
			.addText((text) => {
				text.setPlaceholder("1")
					.setValue(String(this.formData.quantity || 1))
					.onChange((value) => {
						const num = parseInt(value);
						this.formData.quantity = isNaN(num)
							? 1
							: Math.max(1, num);
					});
				text.inputEl.type = "number";
				text.inputEl.min = "1";
			});

		// Target Budget
		new Setting(form)
			.setName("الميزانية المستهدفة")
			.setDesc("الحد الأقصى للسعر المرغوب (اختياري)")
			.addText((text) => {
				text.setPlaceholder("مثال: 1000")
					.setValue(String(this.formData.targetBudget || ""))
					.onChange((value) => {
						const num = parseFloat(value);
						this.formData.targetBudget = isNaN(num)
							? undefined
							: num;
					});
				text.inputEl.type = "number";
				text.inputEl.min = "0";
				text.inputEl.step = "0.01";
			});

		// Tags
		new Setting(form)
			.setName("العلامات")
			.setDesc("علامات للتصنيف (مفصولة بفواصل)")
			.addText((text) => {
				text.setPlaceholder("مثال: إلكترونيات, جوال, آبل")
					.setValue(this.formData.tags?.join(", ") || "")
					.onChange((value) => {
						this.formData.tags = value
							.split(",")
							.map((tag) => tag.trim())
							.filter((tag) => tag.length > 0);
					});
			});

		// Notes
		new Setting(form)
			.setName("ملاحظات")
			.setDesc("ملاحظات إضافية (اختياري)")
			.addTextArea((text) => {
				text.setPlaceholder("أي ملاحظات أو تذكيرات...")
					.setValue(this.formData.notes || "")
					.onChange((value) => {
						this.formData.notes = value;
					});
				text.inputEl.rows = 3;
			});

		// Websites section
		const websitesSection = form.createDiv("websites-section");
		websitesSection.createEl("h3", { text: "المواقع والأسعار" });
		websitesSection.createEl("p", {
			text: "أضف المواقع التي تبيع هذا العنصر لتتبع الأسعار",
			cls: "setting-item-description",
		});

		const websitesList = websitesSection.createDiv("websites-list");
		this.updateWebsitesList(websitesList);

		// Add website button
		const addWebsiteBtn = websitesSection.createEl("button", {
			text: "+ إضافة موقع",
			cls: "mod-cta",
		});
		addWebsiteBtn.onclick = () => {
			this.addWebsite(websitesList);
		};

		// Form actions
		const actions = form.createDiv("form-actions");

		const cancelBtn = actions.createEl("button", {
			text: "إلغاء",
			cls: "btn-secondary",
		});
		cancelBtn.onclick = () => this.close();

		const submitBtn = actions.createEl("button", {
			text: "إضافة العنصر",
			cls: "btn-primary",
		});
		submitBtn.onclick = () => this.handleSubmit();
	}

	private updateWebsitesList(container: HTMLElement) {
		container.empty();

		if (!this.formData.websites) {
			this.formData.websites = [];
		}

		this.formData.websites.forEach((website, index) => {
			this.createWebsiteItem(container, website, index);
		});
	}

	private createWebsiteItem(
		container: HTMLElement,
		website: Website,
		index: number
	) {
		const websiteItem = container.createDiv("website-form-item");

		// Website name
		new Setting(websiteItem)
			.setName(`الموقع ${index + 1} - الاسم`)
			.addText((text) => {
				text.setPlaceholder("مثال: أمازون السعودية")
					.setValue(website.name)
					.onChange((value) => {
						this.formData.websites![index].name = value;
					});
			});

		// Website URL
		new Setting(websiteItem).setName("رابط المنتج").addText((text) => {
			text.setPlaceholder("https://...")
				.setValue(website.url)
				.onChange((value) => {
					this.formData.websites![index].url = value;
				});
		});

		// Price selectors
		new Setting(websiteItem)
			.setName("محددات السعر")
			.setDesc("CSS selectors لاستخراج السعر (مفصولة بفواصل)")
			.addText((text) => {
				text.setPlaceholder(".price, .a-price-whole, #price")
					.setValue(website.priceSelector.join(", "))
					.onChange((value) => {
						this.formData.websites![index].priceSelector = value
							.split(",")
							.map((selector) => selector.trim())
							.filter((selector) => selector.length > 0);
					});
			});

		// Currency
		new Setting(websiteItem).setName("العملة").addDropdown((dropdown) => {
			dropdown.addOption("ر.س", "ريال سعودي (ر.س)");
			dropdown.addOption("$", "دولار أمريكي ($)");
			dropdown.addOption("€", "يورو (€)");
			dropdown.addOption("£", "جنيه إسترليني (£)");
			dropdown.addOption("د.إ", "درهم إماراتي (د.إ)");
			dropdown.setValue(website.currency);
			dropdown.onChange((value) => {
				this.formData.websites![index].currency = value;
			});
		});

		// Current price (optional)
		new Setting(websiteItem)
			.setName("السعر الحالي (اختياري)")
			.addText((text) => {
				text.setPlaceholder("السعر بالأرقام فقط")
					.setValue(
						website.currentPrice ? String(website.currentPrice) : ""
					)
					.onChange((value) => {
						const price = parseFloat(value);
						this.formData.websites![index].currentPrice = isNaN(
							price
						)
							? undefined
							: price;
					});
				text.inputEl.type = "number";
				text.inputEl.min = "0";
				text.inputEl.step = "0.01";
			});

		// Remove website button
		const removeBtn = websiteItem.createEl("button", {
			text: "🗑️ إزالة الموقع",
			cls: "btn-secondary",
		});
		removeBtn.onclick = () => {
			this.formData.websites!.splice(index, 1);
			this.updateWebsitesList(
				container.parentElement!.querySelector(
					".websites-list"
				) as HTMLElement
			);
		};

		websiteItem.createEl("hr");
	}

	private addWebsite(websitesListContainer: HTMLElement) {
		const newWebsite: Website = {
			id: `website_${Date.now()}_${Math.random()
				.toString(36)
				.substr(2, 9)}`,
			name: "",
			url: "",
			priceSelector: [".price"],
			currency: "ر.س",
			isActive: true,
		};

		if (!this.formData.websites) {
			this.formData.websites = [];
		}

		this.formData.websites.push(newWebsite);
		this.updateWebsitesList(websitesListContainer);
	}

	private async handleSubmit() {
		// Validation
		if (!this.formData.name?.trim()) {
			new Notice("يرجى إدخال اسم العنصر");
			return;
		}

		if (!this.formData.categoryId) {
			new Notice("يرجى اختيار فئة العنصر");
			return;
		}

		// Validate websites
		if (this.formData.websites && this.formData.websites.length > 0) {
			for (const website of this.formData.websites) {
				if (!website.name.trim()) {
					new Notice("يرجى إدخال اسم لجميع المواقع");
					return;
				}
				if (!website.url.trim()) {
					new Notice("يرجى إدخال رابط لجميع المواقع");
					return;
				}
				if (!this.isValidUrl(website.url)) {
					new Notice(`رابط غير صحيح: ${website.url}`);
					return;
				}
				if (website.priceSelector.length === 0) {
					new Notice("يرجى إدخال محدد السعر لجميع المواقع");
					return;
				}
			}
		}

		// Prepare item data
		const itemData = {
			name: this.formData.name!.trim(),
			description: this.formData.description?.trim() || "",
			categoryId: this.formData.categoryId!,
			websites: this.formData.websites || [],
			priceHistory: [],
			alerts: [],
			priority: this.formData.priority || "medium",
			status: this.formData.status || "wishlist",
			tags: this.formData.tags || [],
			notes: this.formData.notes?.trim() || "",
			quantity: this.formData.quantity || 1,
			targetBudget: this.formData.targetBudget,
		} as Omit<ShoppingItem, "id" | "dateAdded" | "dateModified" | "order">;

		// Update website timestamps
		itemData.websites.forEach((website) => {
			website.lastUpdated = Date.now();
		});

		this.onSubmit(itemData);
		this.close();
		new Notice("تم إضافة العنصر بنجاح");
	}

	private isValidUrl(string: string): boolean {
		try {
			new URL(string);
			return true;
		} catch {
			return false;
		}
	}
}
