import { App, Modal, Setting, Notice } from "obsidian";
import BuyingListPlugin from "../../main";

export class SettingsModal extends Modal {
	plugin: BuyingListPlugin;
	private settings: any;

	constructor(app: App, plugin: BuyingListPlugin) {
		super(app);
		this.plugin = plugin;
		this.settings = { ...this.plugin.dataService.getSettings() };
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass("buying-list-modal");

		contentEl.createEl("h2", {
			text: "إعدادات قائمة التسوق",
			cls: "modal-title",
		});

		this.createSettingsForm();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private createSettingsForm() {
		const { contentEl } = this;
		const form = contentEl.createDiv("modal-content");

		// General Settings
		const generalSection = form.createDiv("settings-section");
		generalSection.createEl("h3", { text: "الإعدادات العامة" });

		// Default Currency
		new Setting(generalSection)
			.setName("العملة الافتراضية")
			.setDesc("العملة المستخدمة افتراضياً للعناصر الجديدة")
			.addDropdown((dropdown) => {
				dropdown.addOption("ر.س", "ريال سعودي (ر.س)");
				dropdown.addOption("$", "دولار أمريكي ($)");
				dropdown.addOption("€", "يورو (€)");
				dropdown.addOption("£", "جنيه إسترليني (£)");
				dropdown.addOption("د.إ", "درهم إماراتي (د.إ)");
				dropdown.setValue(this.settings.defaultCurrency);
				dropdown.onChange((value) => {
					this.settings.defaultCurrency = value;
				});
			});

		// Theme
		new Setting(generalSection)
			.setName("المظهر")
			.setDesc("تخصيص مظهر واجهة قائمة التسوق")
			.addDropdown((dropdown) => {
				dropdown.addOption("auto", "تلقائي (حسب نظام التشغيل)");
				dropdown.addOption("light", "فاتح");
				dropdown.addOption("dark", "داكن");
				dropdown.setValue(this.settings.theme);
				dropdown.onChange((value) => {
					this.settings.theme = value;
				});
			});

		// Price Update Settings
		const priceSection = form.createDiv("settings-section");
		priceSection.createEl("h3", { text: "إعدادات تتبع الأسعار" });

		// Update Interval
		new Setting(priceSection)
			.setName("فترة تحديث الأسعار")
			.setDesc("كل كم من الوقت يتم تحديث الأسعار تلقائياً")
			.addDropdown((dropdown) => {
				dropdown.addOption("1800000", "كل 30 دقيقة");
				dropdown.addOption("3600000", "كل ساعة");
				dropdown.addOption("7200000", "كل ساعتين");
				dropdown.addOption("21600000", "كل 6 ساعات");
				dropdown.addOption("43200000", "كل 12 ساعة");
				dropdown.addOption("86400000", "كل 24 ساعة");
				dropdown.setValue(String(this.settings.priceUpdateInterval));
				dropdown.onChange((value) => {
					this.settings.priceUpdateInterval = parseInt(value);
				});
			});

		// Enable Notifications
		new Setting(priceSection)
			.setName("تنبيهات الأسعار")
			.setDesc("تفعيل التنبيهات عند انخفاض الأسعار")
			.addToggle((toggle) => {
				toggle
					.setValue(this.settings.enableNotifications)
					.onChange((value) => {
						this.settings.enableNotifications = value;
					});
			});

		// Data Management
		const dataSection = form.createDiv("settings-section");
		dataSection.createEl("h3", { text: "إدارة البيانات" });

		// Export Data
		new Setting(dataSection)
			.setName("تصدير البيانات")
			.setDesc("تصدير جميع عناصر قائمة التسوق والفئات")
			.addButton((button) => {
				button
					.setButtonText("تصدير")
					.setCta()
					.onClick(() => {
						this.exportData();
					});
			});

		// Import Data
		new Setting(dataSection)
			.setName("استيراد البيانات")
			.setDesc("استيراد البيانات من ملف JSON")
			.addButton((button) => {
				button.setButtonText("استيراد").onClick(() => {
					this.importData();
				});
			});

		// Clear All Data
		new Setting(dataSection)
			.setName("مسح جميع البيانات")
			.setDesc("⚠️ احذر: سيتم حذف جميع العناصر والفئات نهائياً")
			.addButton((button) => {
				button
					.setButtonText("مسح الكل")
					.setWarning()
					.onClick(() => {
						this.clearAllData();
					});
			});

		// Statistics
		const statsSection = form.createDiv("settings-section");
		statsSection.createEl("h3", { text: "الإحصائيات" });

		const items = this.plugin.dataService.getItems();
		const categories = this.plugin.dataService.getCategories();

		const statsDiv = statsSection.createDiv("stats-grid");
		statsDiv.createEl("div", { text: `إجمالي العناصر: ${items.length}` });
		statsDiv.createEl("div", { text: `عدد الفئات: ${categories.length}` });

		const totalWebsites = items.reduce(
			(sum, item) => sum + item.websites.length,
			0
		);
		statsDiv.createEl("div", { text: `إجمالي المواقع: ${totalWebsites}` });

		const totalAlerts = items.reduce(
			(sum, item) => sum + item.alerts.length,
			0
		);
		statsDiv.createEl("div", { text: `تنبيهات الأسعار: ${totalAlerts}` });

		// About
		const aboutSection = form.createDiv("settings-section");
		aboutSection.createEl("h3", { text: "حول الإضافة" });
		aboutSection.createEl("p", {
			text: "إضافة قائمة التسوق الذكية لـ Obsidian",
		});
		aboutSection.createEl("p", { text: "الإصدار: 1.0.0" });
		aboutSection.createEl("p", {
			text: "تتبع الأسعار ومقارنة المواقع مع واجهة عربية كاملة",
		});

		// Form actions
		const actions = form.createDiv("form-actions");

		const cancelBtn = actions.createEl("button", {
			text: "إلغاء",
			cls: "btn-secondary",
		});
		cancelBtn.onclick = () => this.close();

		const resetBtn = actions.createEl("button", {
			text: "إعادة تعيين",
			cls: "btn-secondary",
		});
		resetBtn.onclick = () => this.resetToDefaults();

		const saveBtn = actions.createEl("button", {
			text: "حفظ الإعدادات",
			cls: "btn-primary",
		});
		saveBtn.onclick = () => this.saveSettings();
	}

	private exportData() {
		try {
			const data = this.plugin.dataService.exportData();
			const blob = new Blob([data], { type: "application/json" });
			const url = URL.createObjectURL(blob);

			const a = document.createElement("a");
			a.href = url;
			a.download = `buying-list-backup-${
				new Date().toISOString().split("T")[0]
			}.json`;
			a.click();

			URL.revokeObjectURL(url);
			new Notice("تم تصدير البيانات بنجاح");
		} catch (error) {
			new Notice("فشل في تصدير البيانات");
		}
	}

	private importData() {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = ".json";
		input.onchange = async (e) => {
			const file = (e.target as HTMLInputElement).files?.[0];
			if (!file) return;

			try {
				const text = await file.text();
				await this.plugin.dataService.importData(text);
				new Notice("تم استيراد البيانات بنجاح");
				this.close();
			} catch (error) {
				new Notice("فشل في استيراد البيانات - تأكد من صحة الملف");
			}
		};
		input.click();
	}

	private async clearAllData() {
		const confirm = window.confirm(
			"هل أنت متأكد من حذف جميع البيانات؟\n\nسيتم حذف:\n- جميع العناصر\n- الفئات المخصصة\n- تاريخ الأسعار\n- التنبيهات\n\nهذا الإجراء لا يمكن التراجع عنه!"
		);

		if (!confirm) return;

		try {
			// Reset to default data
			await this.plugin.dataService.importData(
				JSON.stringify({
					items: [],
					categories: [],
					settings: this.plugin.dataService.getSettings(),
					version: "1.0.0",
				})
			);

			new Notice("تم مسح جميع البيانات");
			this.close();
		} catch (error) {
			new Notice("حدث خطأ أثناء مسح البيانات");
		}
	}

	private resetToDefaults() {
		this.settings = {
			defaultCurrency: "ر.س",
			priceUpdateInterval: 3600000,
			enableNotifications: true,
			theme: "auto",
		};

		// Refresh the form
		this.close();
		this.open();
		new Notice("تم إعادة تعيين الإعدادات للافتراضية");
	}

	private async saveSettings() {
		try {
			await this.plugin.dataService.updateSettings(this.settings);

			// Restart price monitoring with new interval
			if (this.plugin.priceService) {
				this.plugin.priceService.stopPriceMonitoring();
				this.plugin.priceService.startPriceMonitoring();
			}

			new Notice("تم حفظ الإعدادات بنجاح");
			this.close();
		} catch (error) {
			new Notice("فشل في حفظ الإعدادات");
		}
	}
}
