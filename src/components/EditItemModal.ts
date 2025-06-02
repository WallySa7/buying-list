import { App, Modal, Setting, Notice } from "obsidian";
import { ShoppingItem, Website } from "../models/ShoppingItem";
import BuyingListPlugin from "../../main";

export class EditItemModal extends Modal {
	plugin: BuyingListPlugin;
	item: ShoppingItem;
	onSubmit: () => void;

	private formData: ShoppingItem;

	constructor(
		app: App,
		plugin: BuyingListPlugin,
		item: ShoppingItem,
		onSubmit: () => void
	) {
		super(app);
		this.plugin = plugin;
		this.item = item;
		this.onSubmit = onSubmit;

		// Deep clone the item for editing
		this.formData = JSON.parse(JSON.stringify(item));
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("buying-list-modal");

		contentEl.createEl("h2", { text: "تعديل العنصر", cls: "modal-title" });

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
		new Setting(form).setName("اسم العنصر").addText((text) => {
			text.setPlaceholder("اسم العنصر")
				.setValue(this.formData.name)
				.onChange((value) => {
					this.formData.name = value;
				});
			text.inputEl.focus();
		});

		// Description
		new Setting(form).setName("الوصف").addTextArea((text) => {
			text.setPlaceholder("وصف العنصر...")
				.setValue(this.formData.description || "")
				.onChange((value) => {
					this.formData.description = value;
				});
			text.inputEl.rows = 3;
		});

		// Category
		const categories = this.plugin.dataService.getCategories();
		new Setting(form).setName("الفئة").addDropdown((dropdown) => {
			categories.forEach((category) => {
				dropdown.addOption(
					category.id,
					`${category.icon || "📁"} ${category.name}`
				);
			});
			dropdown.setValue(this.formData.categoryId);
			dropdown.onChange((value) => {
				this.formData.categoryId = value;
			});
		});

		// Priority
		new Setting(form).setName("الأولوية").addDropdown((dropdown) => {
			dropdown.addOption("low", "منخفضة");
			dropdown.addOption("medium", "متوسطة");
			dropdown.addOption("high", "عالية");
			dropdown.setValue(this.formData.priority);
			dropdown.onChange((value) => {
				this.formData.priority = value as "low" | "medium" | "high";
			});
		});

		// Status
		new Setting(form).setName("الحالة").addDropdown((dropdown) => {
			dropdown.addOption("wishlist", "قائمة الأمنيات");
			dropdown.addOption("needed", "مطلوب");
			dropdown.addOption("purchased", "تم الشراء");
			dropdown.setValue(this.formData.status);
			dropdown.onChange((value) => {
				this.formData.status = value as
					| "wishlist"
					| "needed"
					| "purchased";
			});
		});

		// Quantity
		new Setting(form).setName("الكمية").addText((text) => {
			text.setPlaceholder("1")
				.setValue(String(this.formData.quantity || 1))
				.onChange((value) => {
					const num = parseInt(value);
					this.formData.quantity = isNaN(num) ? 1 : Math.max(1, num);
				});
			text.inputEl.type = "number";
			text.inputEl.min = "1";
		});

		// Target Budget
		new Setting(form).setName("الميزانية المستهدفة").addText((text) => {
			text.setPlaceholder("الحد الأقصى للسعر")
				.setValue(
					this.formData.targetBudget
						? String(this.formData.targetBudget)
						: ""
				)
				.onChange((value) => {
					const num = parseFloat(value);
					this.formData.targetBudget = isNaN(num) ? undefined : num;
				});
			text.inputEl.type = "number";
			text.inputEl.min = "0";
			text.inputEl.step = "0.01";
		});

		// Tags
		new Setting(form).setName("العلامات").addText((text) => {
			text.setPlaceholder("علامات مفصولة بفواصل")
				.setValue(this.formData.tags.join(", "))
				.onChange((value) => {
					this.formData.tags = value
						.split(",")
						.map((tag) => tag.trim())
						.filter((tag) => tag.length > 0);
				});
		});

		// Notes
		new Setting(form).setName("ملاحظات").addTextArea((text) => {
			text.setPlaceholder("ملاحظات إضافية...")
				.setValue(this.formData.notes || "")
				.onChange((value) => {
					this.formData.notes = value;
				});
			text.inputEl.rows = 3;
		});

		// Websites section
		const websitesSection = form.createDiv("websites-section");
		websitesSection.createEl("h3", { text: "المواقع والأسعار" });

		const websitesList = websitesSection.createDiv("websites-list");
		this.updateWebsitesList(websitesList);

		const addWebsiteBtn = websitesSection.createEl("button", {
			text: "+ إضافة موقع",
			cls: "mod-cta",
		});
		addWebsiteBtn.onclick = () => {
			this.addWebsite(websitesList);
		};

		// Price alerts section
		if (this.formData.alerts.length > 0) {
			const alertsSection = form.createDiv("alerts-section");
			alertsSection.createEl("h3", { text: "تنبيهات الأسعار" });

			this.formData.alerts.forEach((alert, index) => {
				const alertItem = alertsSection.createDiv("alert-item");
				const website = this.formData.websites.find(
					(w) => w.id === alert.websiteId
				);

				alertItem.createEl("span", {
					text: `${website?.name || "موقع غير معروف"}: ${
						alert.condition === "below"
							? "أقل من"
							: alert.condition === "above"
							? "أكثر من"
							: "يساوي"
					} ${alert.targetPrice} ${website?.currency || "ر.س"}`,
				});

				const toggleBtn = alertItem.createEl("button", {
					text: alert.isActive ? "✅ مفعل" : "❌ معطل",
					cls: alert.isActive ? "btn-primary" : "btn-secondary",
				});
				toggleBtn.onclick = () => {
					this.formData.alerts[index].isActive =
						!this.formData.alerts[index].isActive;
					toggleBtn.textContent = this.formData.alerts[index].isActive
						? "✅ مفعل"
						: "❌ معطل";
					toggleBtn.className = this.formData.alerts[index].isActive
						? "btn-primary"
						: "btn-secondary";
				};

				const removeBtn = alertItem.createEl("button", {
					text: "🗑️",
					cls: "btn-secondary",
				});
				removeBtn.onclick = () => {
					this.formData.alerts.splice(index, 1);
					alertItem.remove();
				};
			});
		}

		// Form actions
		const actions = form.createDiv("form-actions");

		const cancelBtn = actions.createEl("button", {
			text: "إلغاء",
			cls: "btn-secondary",
		});
		cancelBtn.onclick = () => this.close();

		const submitBtn = actions.createEl("button", {
			text: "حفظ التغييرات",
			cls: "btn-primary",
		});
		submitBtn.onclick = () => this.handleSubmit();
	}

	private updateWebsitesList(container: HTMLElement) {
		container.empty();

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
				text.setPlaceholder("اسم الموقع")
					.setValue(website.name)
					.onChange((value) => {
						this.formData.websites[index].name = value;
					});
			});

		// Website URL
		new Setting(websiteItem).setName("رابط المنتج").addText((text) => {
			text.setPlaceholder("https://...")
				.setValue(website.url)
				.onChange((value) => {
					this.formData.websites[index].url = value;
				});
		});

		// Price selectors
		new Setting(websiteItem).setName("محددات السعر").addText((text) => {
			text.setPlaceholder("CSS selectors")
				.setValue(website.priceSelector.join(", "))
				.onChange((value) => {
					this.formData.websites[index].priceSelector = value
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
				this.formData.websites[index].currency = value;
			});
		});

		// Current price
		new Setting(websiteItem).setName("السعر الحالي").addText((text) => {
			text.setPlaceholder("السعر")
				.setValue(
					website.currentPrice ? String(website.currentPrice) : ""
				)
				.onChange((value) => {
					const price = parseFloat(value);
					this.formData.websites[index].currentPrice = isNaN(price)
						? undefined
						: price;
				});
			text.inputEl.type = "number";
			text.inputEl.min = "0";
			text.inputEl.step = "0.01";
		});

		// Website status
		new Setting(websiteItem).setName("حالة الموقع").addToggle((toggle) => {
			toggle.setValue(website.isActive).onChange((value) => {
				this.formData.websites[index].isActive = value;
			});
		});

		// Add price alert for this website
		const addAlertBtn = websiteItem.createEl("button", {
			text: "+ إضافة تنبيه سعر",
			cls: "btn-secondary",
		});
		addAlertBtn.onclick = () => {
			this.openAddAlertModal(website.id);
		};

		// Remove website button
		const removeBtn = websiteItem.createEl("button", {
			text: "🗑️ إزالة الموقع",
			cls: "btn-secondary",
		});
		removeBtn.onclick = () => {
			this.formData.websites.splice(index, 1);
			this.updateWebsitesList(container);
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

		this.formData.websites.push(newWebsite);
		this.updateWebsitesList(websitesListContainer);
	}

	private openAddAlertModal(websiteId: string) {
		const website = this.formData.websites.find((w) => w.id === websiteId);
		if (!website) return;

		const alertModal = new Modal(this.app);
		alertModal.contentEl.addClass("buying-list-modal");
		alertModal.contentEl.createEl("h3", {
			text: `إضافة تنبيه سعر - ${website.name}`,
		});

		let targetPrice = "";
		let condition: "below" | "above" | "equal" = "below";

		new Setting(alertModal.contentEl)
			.setName("السعر المستهدف")
			.addText((text) => {
				text.setPlaceholder("السعر").onChange((value) => {
					targetPrice = value;
				});
				text.inputEl.type = "number";
				text.inputEl.min = "0";
				text.inputEl.step = "0.01";
			});

		new Setting(alertModal.contentEl)
			.setName("الشرط")
			.addDropdown((dropdown) => {
				dropdown.addOption("below", "أقل من");
				dropdown.addOption("above", "أكثر من");
				dropdown.addOption("equal", "يساوي");
				dropdown.setValue("below");
				dropdown.onChange((value) => {
					condition = value as "below" | "above" | "equal";
				});
			});

		const actions = alertModal.contentEl.createDiv("form-actions");

		const cancelBtn = actions.createEl("button", {
			text: "إلغاء",
			cls: "btn-secondary",
		});
		cancelBtn.onclick = () => alertModal.close();

		const addBtn = actions.createEl("button", {
			text: "إضافة التنبيه",
			cls: "btn-primary",
		});
		addBtn.onclick = () => {
			const price = parseFloat(targetPrice);
			if (isNaN(price) || price <= 0) {
				new Notice("يرجى إدخال سعر صحيح");
				return;
			}

			const alert = {
				id: `alert_${Date.now()}_${Math.random()
					.toString(36)
					.substr(2, 9)}`,
				websiteId,
				targetPrice: price,
				condition,
				isActive: true,
			};

			this.formData.alerts.push(alert);
			alertModal.close();
			this.close();
			this.open(); // Refresh modal
		};

		alertModal.open();
	}

	private async handleSubmit() {
		// Validation
		if (!this.formData.name?.trim()) {
			new Notice("يرجى إدخال اسم العنصر");
			return;
		}

		// Validate websites
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
		}

		// Update the item
		await this.plugin.dataService.updateItem(this.item.id, {
			...this.formData,
			dateModified: Date.now(),
		});

		this.onSubmit();
		this.close();
		new Notice("تم تحديث العنصر بنجاح");
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
