import { App, Modal, Setting, Notice } from "obsidian";
import { Category } from "../models/Category";
import BuyingListPlugin from "../../main";

export class AddCategoryModal extends Modal {
	plugin: BuyingListPlugin;
	onSubmit: () => void;

	private formData: Partial<Category> = {
		name: "",
		description: "",
		color: "#3b82f6",
		icon: "📁",
		order: 0,
		isDefault: false,
	};

	constructor(app: App, plugin: BuyingListPlugin, onSubmit: () => void) {
		super(app);
		this.plugin = plugin;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("buying-list-modal");

		contentEl.createEl("h2", {
			text: "إضافة فئة جديدة",
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

		// Category name
		new Setting(form)
			.setName("اسم الفئة")
			.setDesc("اسم الفئة الجديدة")
			.addText((text) => {
				text.setPlaceholder("مثال: ألعاب فيديو")
					.setValue(this.formData.name || "")
					.onChange((value) => {
						this.formData.name = value;
					});
				text.inputEl.focus();
			});

		// Description
		new Setting(form)
			.setName("الوصف")
			.setDesc("وصف مختصر للفئة (اختياري)")
			.addTextArea((text) => {
				text.setPlaceholder("وصف الفئة...")
					.setValue(this.formData.description || "")
					.onChange((value) => {
						this.formData.description = value;
					});
				text.inputEl.rows = 2;
			});

		// Icon
		new Setting(form)
			.setName("الأيقونة")
			.setDesc("إيموجي أو رمز للفئة")
			.addText((text) => {
				text.setPlaceholder("🎮")
					.setValue(this.formData.icon || "")
					.onChange((value) => {
						this.formData.icon = value;
					});
			});

		// Color
		new Setting(form)
			.setName("اللون")
			.setDesc("لون الفئة للتمييز البصري")
			.addColorPicker((color) => {
				color
					.setValue(this.formData.color || "#3b82f6")
					.onChange((value) => {
						this.formData.color = value;
					});
			});

		// Predefined colors
		const colorOptions = form.createDiv("color-options");
		colorOptions.createEl("label", { text: "ألوان سريعة:" });
		const colors = [
			"#3b82f6",
			"#10b981",
			"#f59e0b",
			"#ef4444",
			"#8b5cf6",
			"#06b6d4",
			"#ec4899",
			"#6b7280",
		];

		const colorPalette = colorOptions.createDiv("color-palette");
		colors.forEach((color) => {
			const colorBtn = colorPalette.createEl("button", {
				cls: "color-btn",
			});
			colorBtn.style.backgroundColor = color;
			colorBtn.onclick = () => {
				this.formData.color = color;
				// Update color picker if available
				const colorInput = form.querySelector(
					'input[type="color"]'
				) as HTMLInputElement;
				if (colorInput) colorInput.value = color;
			};
		});

		// Form actions
		const actions = form.createDiv("form-actions");

		const cancelBtn = actions.createEl("button", {
			text: "إلغاء",
			cls: "btn-secondary",
		});
		cancelBtn.onclick = () => this.close();

		const submitBtn = actions.createEl("button", {
			text: "إضافة الفئة",
			cls: "btn-primary",
		});
		submitBtn.onclick = () => this.handleSubmit();
	}

	private async handleSubmit() {
		if (!this.formData.name?.trim()) {
			new Notice("يرجى إدخال اسم الفئة");
			return;
		}

		// Check for duplicate names
		const existingCategories = this.plugin.dataService.getCategories();
		const nameExists = existingCategories.some(
			(cat) =>
				cat.name.toLowerCase() ===
				this.formData.name!.toLowerCase().trim()
		);

		if (nameExists) {
			new Notice("اسم الفئة موجود بالفعل");
			return;
		}

		// Set order as the last
		this.formData.order = existingCategories.length;

		const categoryData = {
			name: this.formData.name!.trim(),
			description: this.formData.description?.trim() || "",
			color: this.formData.color || "#3b82f6",
			icon: this.formData.icon?.trim() || "📁",
			order: this.formData.order,
			isDefault: false,
		} as Omit<Category, "id" | "dateCreated" | "dateModified" | "parentId">;

		await this.plugin.dataService.addCategory(categoryData);
		this.onSubmit();
		this.close();
		new Notice("تم إضافة الفئة بنجاح");
	}
}

export class EditCategoryModal extends Modal {
	plugin: BuyingListPlugin;
	category: Category;
	onSubmit: () => void;

	private formData: Category;

	constructor(
		app: App,
		plugin: BuyingListPlugin,
		category: Category,
		onSubmit: () => void
	) {
		super(app);
		this.plugin = plugin;
		this.category = category;
		this.onSubmit = onSubmit;
		this.formData = { ...category };
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("buying-list-modal");

		contentEl.createEl("h2", { text: "تعديل الفئة", cls: "modal-title" });

		this.createForm();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private createForm() {
		const { contentEl } = this;
		const form = contentEl.createDiv("modal-content");

		// Show warning for default categories
		if (this.category.isDefault) {
			const warning = form.createDiv("warning-message");
			warning.createEl("p", {
				text: "⚠️ هذه فئة افتراضية. يمكن تعديل الاسم والوصف والأيقونة واللون فقط.",
				cls: "warning-text",
			});
		}

		// Category name
		new Setting(form).setName("اسم الفئة").addText((text) => {
			text.setPlaceholder("اسم الفئة")
				.setValue(this.formData.name)
				.onChange((value) => {
					this.formData.name = value;
				});
			text.inputEl.focus();
		});

		// Description
		new Setting(form).setName("الوصف").addTextArea((text) => {
			text.setPlaceholder("وصف الفئة...")
				.setValue(this.formData.description || "")
				.onChange((value) => {
					this.formData.description = value;
				});
			text.inputEl.rows = 2;
		});

		// Icon
		new Setting(form).setName("الأيقونة").addText((text) => {
			text.setPlaceholder("🎮")
				.setValue(this.formData.icon || "")
				.onChange((value) => {
					this.formData.icon = value;
				});
		});

		// Color
		new Setting(form).setName("اللون").addColorPicker((color) => {
			color.setValue(this.formData.color).onChange((value) => {
				this.formData.color = value;
			});
		});

		// Quick colors (same as add modal)
		const colorOptions = form.createDiv("color-options");
		colorOptions.createEl("label", { text: "ألوان سريعة:" });
		const colors = [
			"#3b82f6",
			"#10b981",
			"#f59e0b",
			"#ef4444",
			"#8b5cf6",
			"#06b6d4",
			"#ec4899",
			"#6b7280",
		];

		const colorPalette = colorOptions.createDiv("color-palette");
		colors.forEach((color) => {
			const colorBtn = colorPalette.createEl("button", {
				cls: "color-btn",
			});
			colorBtn.style.backgroundColor = color;
			colorBtn.onclick = () => {
				this.formData.color = color;
				const colorInput = form.querySelector(
					'input[type="color"]'
				) as HTMLInputElement;
				if (colorInput) colorInput.value = color;
			};
		});

		// Category statistics
		const items = this.plugin.dataService.getItems({
			categoryIds: [this.category.id],
		});
		const statsSection = form.createDiv("category-stats");
		statsSection.createEl("h3", { text: "إحصائيات الفئة" });
		statsSection.createEl("p", { text: `عدد العناصر: ${items.length}` });

		if (items.length > 0) {
			const totalValue = items.reduce((sum, item) => {
				const prices = item.websites
					.filter((w) => w.currentPrice !== undefined)
					.map((w) => w.currentPrice!);
				return sum + (prices.length > 0 ? Math.min(...prices) : 0);
			}, 0);
			statsSection.createEl("p", {
				text: `القيمة الإجمالية: ${totalValue.toFixed(2)} ر.س`,
			});
		}

		// Form actions
		const actions = form.createDiv("form-actions");

		const cancelBtn = actions.createEl("button", {
			text: "إلغاء",
			cls: "btn-secondary",
		});
		cancelBtn.onclick = () => this.close();

		// Delete button (only for non-default categories with no items)
		if (!this.category.isDefault && items.length === 0) {
			const deleteBtn = actions.createEl("button", {
				text: "حذف الفئة",
				cls: "btn-danger",
			});
			deleteBtn.onclick = () => this.handleDelete();
		}

		const submitBtn = actions.createEl("button", {
			text: "حفظ التغييرات",
			cls: "btn-primary",
		});
		submitBtn.onclick = () => this.handleSubmit();
	}

	private async handleSubmit() {
		if (!this.formData.name?.trim()) {
			new Notice("يرجى إدخال اسم الفئة");
			return;
		}

		// Check for duplicate names (excluding current category)
		const existingCategories = this.plugin.dataService.getCategories();
		const nameExists = existingCategories.some(
			(cat) =>
				cat.id !== this.category.id &&
				cat.name.toLowerCase() ===
					this.formData.name!.toLowerCase().trim()
		);

		if (nameExists) {
			new Notice("اسم الفئة موجود بالفعل");
			return;
		}

		await this.plugin.dataService.updateCategory(this.category.id, {
			name: this.formData.name.trim(),
			description: this.formData.description?.trim() || "",
			color: this.formData.color,
			icon: this.formData.icon?.trim() || "",
			dateModified: Date.now(),
		});

		this.onSubmit();
		this.close();
		new Notice("تم تحديث الفئة بنجاح");
	}

	private async handleDelete() {
		const confirmDelete = confirm(
			`هل أنت متأكد من حذف الفئة "${this.category.name}"؟`
		);
		if (!confirmDelete) return;

		await this.plugin.dataService.deleteCategory(this.category.id);
		this.onSubmit();
		this.close();
		new Notice("تم حذف الفئة بنجاح");
	}
}
