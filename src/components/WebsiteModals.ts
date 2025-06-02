import { App, Modal, Setting, Notice } from "obsidian";
import { Website } from "../models/ShoppingItem";
import BuyingListPlugin from "../../main";

export class AddWebsiteModal extends Modal {
	plugin: BuyingListPlugin;
	itemId: string;
	onSubmit: () => void;

	private formData: Partial<Website> = {
		name: "",
		url: "",
		priceSelector: [".price"],
		currency: "ر.س",
		isActive: true,
	};

	constructor(
		app: App,
		plugin: BuyingListPlugin,
		itemId: string,
		onSubmit: () => void
	) {
		super(app);
		this.plugin = plugin;
		this.itemId = itemId;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("buying-list-modal");

		contentEl.createEl("h2", {
			text: "إضافة موقع جديد",
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

		// Website name
		new Setting(form)
			.setName("اسم الموقع")
			.setDesc("اسم الموقع أو المتجر")
			.addText((text) => {
				text.setPlaceholder("مثال: أمازون السعودية")
					.setValue(this.formData.name || "")
					.onChange((value) => {
						this.formData.name = value;
					});
				text.inputEl.focus();
			});

		// Website URL
		new Setting(form)
			.setName("رابط المنتج")
			.setDesc("الرابط الكامل لصفحة المنتج")
			.addText((text) => {
				text.setPlaceholder("https://www.amazon.sa/product/...")
					.setValue(this.formData.url || "")
					.onChange((value) => {
						this.formData.url = value;
					});
			});

		// Price selectors
		new Setting(form)
			.setName("محددات السعر")
			.setDesc("CSS selectors لاستخراج السعر من الصفحة (مفصولة بفواصل)")
			.addTextArea((text) => {
				text.setPlaceholder(
					".price, .a-price-whole, #priceblock_dealprice, .a-price .a-offscreen"
				)
					.setValue(
						this.formData.priceSelector?.join(", ") || ".price"
					)
					.onChange((value) => {
						this.formData.priceSelector = value
							.split(",")
							.map((selector) => selector.trim())
							.filter((selector) => selector.length > 0);
					});
				text.inputEl.rows = 3;
			});

		// Common selectors help
		const selectorsHelp = form.createDiv("selectors-help");
		selectorsHelp.createEl("h4", { text: "محددات شائعة:" });
		const commonSelectors = selectorsHelp.createDiv("common-selectors");

		const selectorExamples = [
			{
				site: "أمازون",
				selectors: ".a-price .a-offscreen, .a-price-whole",
			},
			{ site: "نون", selectors: ".price, .price-now" },
			{ site: "جرير", selectors: ".price, .product-price" },
			{ site: "إكسترا", selectors: ".price, .regular-price" },
			{ site: "عام", selectors: ".price, #price, [data-price], .amount" },
		];

		selectorExamples.forEach((example) => {
			const exampleDiv = commonSelectors.createDiv("selector-example");
			exampleDiv.createEl("strong", { text: `${example.site}: ` });
			exampleDiv.createEl("code", { text: example.selectors });

			const useBtn = exampleDiv.createEl("button", {
				text: "استخدام",
				cls: "btn-secondary",
			});
			useBtn.onclick = () => {
				this.formData.priceSelector = example.selectors.split(", ");
				const textarea = form.querySelector(
					"textarea"
				) as HTMLTextAreaElement;
				if (textarea) textarea.value = example.selectors;
			};
		});

		// Currency
		new Setting(form)
			.setName("العملة")
			.setDesc("عملة الأسعار في هذا الموقع")
			.addDropdown((dropdown) => {
				dropdown.addOption("ر.س", "ريال سعودي (ر.س)");
				dropdown.addOption("$", "دولار أمريكي ($)");
				dropdown.addOption("€", "يورو (€)");
				dropdown.addOption("£", "جنيه إسترليني (£)");
				dropdown.addOption("د.إ", "درهم إماراتي (د.إ)");
				dropdown.setValue(this.formData.currency || "ر.س");
				dropdown.onChange((value) => {
					this.formData.currency = value;
				});
			});

		// Current price (optional)
		new Setting(form)
			.setName("السعر الحالي (اختياري)")
			.setDesc("يمكنك إدخال السعر الحالي يدوياً")
			.addText((text) => {
				text.setPlaceholder("مثال: 299.99")
					.setValue(
						this.formData.currentPrice
							? String(this.formData.currentPrice)
							: ""
					)
					.onChange((value) => {
						const price = parseFloat(value);
						this.formData.currentPrice = isNaN(price)
							? undefined
							: price;
					});
				text.inputEl.type = "number";
				text.inputEl.min = "0";
				text.inputEl.step = "0.01";
			});

		// Test extraction button
		const testSection = form.createDiv("test-section");
		testSection.createEl("h4", { text: "اختبار استخراج السعر:" });

		const testBtn = testSection.createEl("button", {
			text: "🔍 اختبار الاستخراج",
			cls: "mod-cta",
		});

		const testResult = testSection.createDiv("test-result");

		testBtn.onclick = async () => {
			if (!this.formData.url || !this.formData.priceSelector?.length) {
				new Notice("يرجى إدخال الرابط ومحددات السعر أولاً");
				return;
			}

			testBtn.textContent = "⏳ جاري الاختبار...";
			testBtn.disabled = true;
			testResult.empty();

			try {
				const tempWebsite: Website = {
					id: "temp",
					name: this.formData.name || "اختبار",
					url: this.formData.url,
					priceSelector: this.formData.priceSelector,
					currency: this.formData.currency || "ر.س",
					isActive: true,
				};

				const result =
					await this.plugin.priceService.updateWebsitePrice(
						"temp",
						"temp"
					);

				if (result.success && result.price !== undefined) {
					testResult.createEl("div", {
						text: `✅ تم استخراج السعر بنجاح: ${result.price} ${this.formData.currency}`,
						cls: "test-success",
					});

					// Auto-fill the price field
					this.formData.currentPrice = result.price;
					const priceInput = form.querySelector(
						'input[type="number"]'
					) as HTMLInputElement;
					if (priceInput) priceInput.value = String(result.price);
				} else {
					testResult.createEl("div", {
						text: `❌ فشل في استخراج السعر: ${
							result.error || "خطأ غير معروف"
						}`,
						cls: "test-error",
					});

					testResult.createEl("div", {
						text: "تأكد من صحة محددات السعر أو جرب محددات أخرى",
						cls: "test-hint",
					});
				}
			} catch (error) {
				testResult.createEl("div", {
					text: `❌ خطأ في الشبكة أو الموقع غير متاح`,
					cls: "test-error",
				});
			}

			testBtn.textContent = "🔍 اختبار الاستخراج";
			testBtn.disabled = false;
		};

		// Form actions
		const actions = form.createDiv("form-actions");

		const cancelBtn = actions.createEl("button", {
			text: "إلغاء",
			cls: "btn-secondary",
		});
		cancelBtn.onclick = () => this.close();

		const submitBtn = actions.createEl("button", {
			text: "إضافة الموقع",
			cls: "btn-primary",
		});
		submitBtn.onclick = () => this.handleSubmit();
	}

	private async handleSubmit() {
		// Validation
		if (!this.formData.name?.trim()) {
			new Notice("يرجى إدخال اسم الموقع");
			return;
		}

		if (!this.formData.url?.trim()) {
			new Notice("يرجى إدخال رابط المنتج");
			return;
		}

		if (!this.isValidUrl(this.formData.url)) {
			new Notice("رابط غير صحيح");
			return;
		}

		if (!this.formData.priceSelector?.length) {
			new Notice("يرجى إدخال محدد السعر على الأقل");
			return;
		}

		// Get current item
		const item = this.plugin.dataService.getItemById(this.itemId);
		if (!item) {
			new Notice("العنصر غير موجود");
			return;
		}

		// Create new website
		const newWebsite: Website = {
			id: `website_${Date.now()}_${Math.random()
				.toString(36)
				.substr(2, 9)}`,
			name: this.formData.name.trim(),
			url: this.formData.url.trim(),
			priceSelector: this.formData.priceSelector,
			currency: this.formData.currency || "ر.س",
			currentPrice: this.formData.currentPrice,
			lastUpdated: this.formData.currentPrice ? Date.now() : undefined,
			isActive: true,
		};

		// Add to item
		item.websites.push(newWebsite);
		await this.plugin.dataService.updateItem(this.itemId, {
			websites: item.websites,
		});

		this.onSubmit();
		this.close();
		new Notice("تم إضافة الموقع بنجاح");
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

export class WebsiteEmbedModal extends Modal {
	website: Website;

	constructor(app: App, website: Website) {
		super(app);
		this.website = website;
	}

	onOpen() {
		const { contentEl, modalEl } = this;
		contentEl.empty();
		modalEl.addClass("website-embed-modal");

		// Header with website info
		const header = contentEl.createDiv("embed-header");
		header.createEl("h2", {
			text: `${this.website.name}`,
			cls: "modal-title",
		});

		const headerInfo = header.createDiv("header-info");
		if (this.website.currentPrice) {
			headerInfo.createEl("span", {
				text: `السعر: ${this.website.currentPrice} ${this.website.currency}`,
				cls: "price-info",
			});
		}

		const openBtn = headerInfo.createEl("button", {
			text: "🔗 فتح في متصفح جديد",
			cls: "btn-secondary",
		});
		openBtn.onclick = () => {
			window.open(this.website.url, "_blank");
		};

		// Create webview container
		const webviewContainer = contentEl.createDiv("webview-container");

		// Note about webview limitations
		const note = webviewContainer.createDiv("webview-note");
		note.createEl("p", {
			text: "💡 ملاحظة: يتم عرض الموقع في إطار مدمج. قد لا تعمل بعض الميزات التفاعلية.",
			cls: "note-text",
		});

		// Create iframe as fallback since webview might not be available
		try {
			const iframe = webviewContainer.createEl("iframe");
			iframe.setAttribute("src", this.website.url);
			iframe.setAttribute(
				"style",
				"width: 100%; height: 80vh; border: none;"
			);
		} catch (error) {
			// Fallback to iframe
			const iframe = webviewContainer.createEl("iframe");
			iframe.setAttribute("src", this.website.url);
			iframe.setAttribute(
				"style",
				"width: 100%; height: 80vh; border: none;"
			);
			iframe.setAttribute(
				"sandbox",
				"allow-same-origin allow-scripts allow-forms"
			);
		}

		// Footer with close button
		const footer = contentEl.createDiv("embed-footer");
		const closeBtn = footer.createEl("button", {
			text: "إغلاق",
			cls: "btn-primary",
		});
		closeBtn.onclick = () => this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}
}
