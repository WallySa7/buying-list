import { App, Plugin, Notice, requestUrl } from "obsidian";
import {
	ShoppingItem,
	Website,
	PriceHistory,
	PriceAlert,
} from "../models/ShoppingItem";
import { DataService } from "./DataService";

export interface PriceUpdateResult {
	websiteId: string;
	success: boolean;
	price?: number;
	error?: string;
}

export interface PriceComparisonResult {
	itemId: string;
	websites: {
		websiteId: string;
		name: string;
		price: number;
		currency: string;
		url: string;
	}[];
	bestPrice: {
		websiteId: string;
		price: number;
		savings?: number;
	};
}

export class PriceService {
	private app: App;
	private plugin: Plugin;
	private dataService: DataService;
	private priceUpdateInterval: NodeJS.Timer | null = null;
	private isMonitoring = false;

	constructor(app: App, plugin: Plugin) {
		this.app = app;
		this.plugin = plugin;
	}

	setDataService(dataService: DataService) {
		this.dataService = dataService;
	}

	startPriceMonitoring(): void {
		if (this.isMonitoring) return;

		const settings = this.dataService.getSettings();
		this.isMonitoring = true;

		this.priceUpdateInterval = setInterval(async () => {
			await this.updateAllPrices();
		}, settings.priceUpdateInterval);

		console.log("Price monitoring started");
	}

	stopPriceMonitoring(): void {
		if (this.priceUpdateInterval) {
			clearInterval(this.priceUpdateInterval);
			this.priceUpdateInterval = null;
		}
		this.isMonitoring = false;
		console.log("Price monitoring stopped");
	}

	async updateAllPrices(): Promise<void> {
		const items = this.dataService.getItems();
		const updatePromises: Promise<void>[] = [];

		for (const item of items) {
			for (const website of item.websites) {
				if (website.isActive) {
					updatePromises.push(
						this.updateWebsitePrice(item.id, website.id).then(
							() => {}
						)
					);
				}
			}
		}

		await Promise.allSettled(updatePromises);
	}

	async updateWebsitePrice(
		itemId: string,
		websiteId: string
	): Promise<PriceUpdateResult> {
		const item = this.dataService.getItemById(itemId);
		if (!item) {
			return { websiteId, success: false, error: "العنصر غير موجود" };
		}

		const website = item.websites.find((w) => w.id === websiteId);
		if (!website) {
			return { websiteId, success: false, error: "الموقع غير موجود" };
		}

		try {
			const price = await this.scrapePrice(website);

			if (price !== null && price !== website.currentPrice) {
				// Update website price
				website.currentPrice = price;
				website.lastUpdated = Date.now();

				// Add to price history
				const priceHistoryEntry: PriceHistory = {
					timestamp: Date.now(),
					price: price,
					websiteId: websiteId,
				};
				item.priceHistory.push(priceHistoryEntry);

				// Keep only last 100 price entries per website
				item.priceHistory = item.priceHistory
					.filter((entry) => entry.websiteId === websiteId)
					.slice(-100)
					.concat(
						item.priceHistory.filter(
							(entry) => entry.websiteId !== websiteId
						)
					);

				// Check for price alerts
				await this.checkPriceAlerts(item, website, price);

				// Update item
				await this.dataService.updateItem(itemId, {
					websites: item.websites,
					priceHistory: item.priceHistory,
				});

				return { websiteId, success: true, price };
			}

			return { websiteId, success: true, price: website.currentPrice };
		} catch (error) {
			console.error(`Failed to update price for ${website.name}:`, error);
			return {
				websiteId,
				success: false,
				error: error instanceof Error ? error.message : "خطأ غير معروف",
			};
		}
	}

	private async scrapePrice(website: Website): Promise<number | null> {
		try {
			// Use Obsidian's requestUrl for web scraping
			const response = await requestUrl({
				url: website.url,
				method: "GET",
				headers: {
					"User-Agent":
						"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
				},
			});

			const html = response.text;

			// Try each selector until one works
			for (const selector of website.priceSelector) {
				const price = this.extractPriceFromHtml(html, selector);
				if (price !== null) {
					return price;
				}
			}

			return null;
		} catch (error) {
			console.error(`Error scraping price from ${website.url}:`, error);
			return null;
		}
	}

	private extractPriceFromHtml(
		html: string,
		selector: string
	): number | null {
		try {
			// Create a temporary DOM parser
			const parser = new DOMParser();
			const doc = parser.parseFromString(html, "text/html");

			// Try to find element by selector with multiple methods
			let element: Element | null = null;

			// Try CSS selector first (most reliable)
			try {
				element = doc.querySelector(selector);
			} catch (e) {
				// Fallback to basic selectors if CSS selector fails
				if (selector.startsWith("#")) {
					element = doc.getElementById(selector.slice(1));
				} else if (selector.startsWith(".")) {
					const elements = doc.getElementsByClassName(
						selector.slice(1)
					);
					element = elements.length > 0 ? elements[0] : null;
				} else {
					const elements = doc.getElementsByTagName(selector);
					element = elements.length > 0 ? elements[0] : null;
				}
			}

			if (!element) return null;

			// Try multiple methods to extract price text
			let priceText = this.extractTextFromElement(element);
			if (!priceText) return null;

			// Clean and parse the price
			const price = this.cleanAndParsePrice(priceText);
			return price;
		} catch (error) {
			console.error("Error parsing HTML:", error);
			return null;
		}
	}

	private extractTextFromElement(element: Element): string {
		// Try different methods to extract price text
		const methods = [
			() => element.textContent || "",
			() => element.getAttribute("content") || "",
			() => element.getAttribute("data-price") || "",
			() => element.getAttribute("value") || "",
			() => element.getAttribute("title") || "",
			() => element.getAttribute("aria-label") || "",
			() => {
				// Look for price in child elements
				const priceElements = element.querySelectorAll(
					'[class*="price"], [data-price], .amount, .cost'
				);
				return priceElements.length > 0
					? priceElements[0].textContent || ""
					: "";
			},
			() => {
				// Look for numbers in any child text
				const walker = document.createTreeWalker(
					element,
					NodeFilter.SHOW_TEXT,
					null
				);
				let textNodes = [];
				let node;
				while ((node = walker.nextNode())) {
					if (node.textContent && /[\d٠-٩]/.test(node.textContent)) {
						textNodes.push(node.textContent);
					}
				}
				return textNodes.join(" ");
			},
		];

		for (const method of methods) {
			try {
				const text = method().trim();
				if (text && /[\d٠-٩]/.test(text)) {
					return text;
				}
			} catch (e) {
				continue;
			}
		}

		return "";
	}

	private cleanAndParsePrice(priceText: string): number | null {
		if (!priceText) return null;

		// Convert Arabic numerals to Western numerals
		const arabicToWestern = {
			"٠": "0",
			"١": "1",
			"٢": "2",
			"٣": "3",
			"٤": "4",
			"٥": "5",
			"٦": "6",
			"٧": "7",
			"٨": "8",
			"٩": "9",
		};

		let cleanText = priceText;

		// Replace Arabic numerals
		for (const [arabic, western] of Object.entries(arabicToWestern)) {
			cleanText = cleanText.replace(new RegExp(arabic, "g"), western);
		}

		// Remove common currency symbols and words
		const currencyPatterns = [
			/ر\.س/g,
			/ريال/g,
			/رس/g,
			/SAR/g,
			/SR/g,
			/\$/g,
			/USD/g,
			/دولار/g,
			/€/g,
			/EUR/g,
			/يورو/g,
			/£/g,
			/GBP/g,
			/جنيه/g,
			/د\.إ/g,
			/درهم/g,
			/AED/g,
			/ج\.م/g,
			/جنيه مصري/g,
			/EGP/g,
			/د\.ك/g,
			/دينار/g,
			/KWD/g,
			/ل\.ل/g,
			/ليرة/g,
			/LBP/g,
			/price/gi,
			/السعر/g,
			/سعر/g,
			/من/g,
			/إلى/g,
			/starting/gi,
			/from/gi,
			/to/gi,
		];

		currencyPatterns.forEach((pattern) => {
			cleanText = cleanText.replace(pattern, " ");
		});

		// Handle different decimal separators
		// Arabic decimal separator ٫ and regular comma ,
		// Also handle thousands separators
		const priceNumbers = this.extractNumbersFromText(cleanText);

		if (priceNumbers.length === 0) return null;

		// Return the largest number found (likely the main price)
		return Math.max(...priceNumbers);
	}

	private extractNumbersFromText(text: string): number[] {
		const numbers: number[] = [];

		// Patterns to match different number formats
		const patterns = [
			// Standard formats: 1234.56, 1,234.56, 1 234.56
			/\d{1,3}(?:[,\s]\d{3})*\.\d{2}/g,
			// Arabic decimal: 1234٫56, 1,234٫56
			/\d{1,3}(?:[,\s]\d{3})*٫\d{2}/g,
			// Integers with thousands separators: 1,234 or 1 234
			/\d{1,3}(?:[,\s]\d{3})+/g,
			// Simple decimals: 123.45
			/\d+\.\d+/g,
			// Arabic decimals: 123٫45
			/\d+٫\d+/g,
			// Plain integers: 1234
			/\d{3,}/g, // At least 3 digits to avoid false positives
			// Any remaining digits (fallback)
			/\d+/g,
		];

		for (const pattern of patterns) {
			const matches = text.match(pattern);
			if (matches) {
				for (const match of matches) {
					const cleaned = this.normalizeNumber(match);
					const num = parseFloat(cleaned);
					if (!isNaN(num) && num > 0) {
						numbers.push(num);
					}
				}
				// If we found numbers with this pattern, don't try simpler patterns
				if (numbers.length > 0) break;
			}
		}

		// Filter out unrealistic prices (too small or too large)
		return numbers.filter((num) => num >= 0.01 && num <= 1000000);
	}

	private normalizeNumber(numberStr: string): string {
		// Remove spaces used as thousands separators
		let normalized = numberStr.replace(/\s/g, "");

		// Handle different decimal separator cases
		if (normalized.includes("٫")) {
			// Arabic decimal separator
			const parts = normalized.split("٫");
			if (parts.length === 2) {
				// Remove commas from integer part (thousands separator)
				const intPart = parts[0].replace(/,/g, "");
				normalized = intPart + "." + parts[1];
			}
		} else if (normalized.includes(".") && normalized.includes(",")) {
			// Both comma and dot - determine which is decimal separator
			const lastComma = normalized.lastIndexOf(",");
			const lastDot = normalized.lastIndexOf(".");

			if (lastDot > lastComma) {
				// Dot is decimal separator, comma is thousands
				normalized = normalized.replace(/,/g, "");
			} else {
				// Comma is decimal separator, dot is thousands
				normalized = normalized.replace(/\./g, "").replace(",", ".");
			}
		} else if (normalized.includes(",")) {
			// Only comma - could be thousands or decimal separator
			const commaIndex = normalized.lastIndexOf(",");
			const afterComma = normalized.substring(commaIndex + 1);

			if (afterComma.length <= 2 && /^\d+$/.test(afterComma)) {
				// Likely decimal separator
				normalized = normalized.replace(",", ".");
			} else {
				// Likely thousands separator
				normalized = normalized.replace(/,/g, "");
			}
		}

		return normalized;
	}

	private async checkPriceAlerts(
		item: ShoppingItem,
		website: Website,
		currentPrice: number
	): Promise<void> {
		const activeAlerts = item.alerts.filter(
			(alert) => alert.isActive && alert.websiteId === website.id
		);

		for (const alert of activeAlerts) {
			let triggered = false;

			switch (alert.condition) {
				case "below":
					triggered = currentPrice < alert.targetPrice;
					break;
				case "above":
					triggered = currentPrice > alert.targetPrice;
					break;
				case "equal":
					triggered =
						Math.abs(currentPrice - alert.targetPrice) < 0.01;
					break;
			}

			if (triggered) {
				const settings = this.dataService.getSettings();
				if (settings.enableNotifications) {
					new Notice(
						`🛒 تنبيه السعر: ${item.name}\n` +
							`${website.name}: ${currentPrice} ${website.currency}\n` +
							`الهدف: ${alert.targetPrice} ${website.currency}`,
						10000
					);
				}

				// Deactivate alert after triggering
				alert.isActive = false;
			}
		}
	}

	async addPriceAlert(
		itemId: string,
		websiteId: string,
		targetPrice: number,
		condition: "below" | "above" | "equal"
	): Promise<void> {
		const item = this.dataService.getItemById(itemId);
		if (!item) return;

		const alert: PriceAlert = {
			id: `alert_${Date.now()}_${Math.random()
				.toString(36)
				.substr(2, 9)}`,
			websiteId,
			targetPrice,
			condition,
			isActive: true,
		};

		item.alerts.push(alert);
		await this.dataService.updateItem(itemId, { alerts: item.alerts });
	}

	async removePriceAlert(itemId: string, alertId: string): Promise<void> {
		const item = this.dataService.getItemById(itemId);
		if (!item) return;

		item.alerts = item.alerts.filter((alert) => alert.id !== alertId);
		await this.dataService.updateItem(itemId, { alerts: item.alerts });
	}

	async togglePriceAlert(itemId: string, alertId: string): Promise<void> {
		const item = this.dataService.getItemById(itemId);
		if (!item) return;

		const alert = item.alerts.find((a) => a.id === alertId);
		if (alert) {
			alert.isActive = !alert.isActive;
			await this.dataService.updateItem(itemId, { alerts: item.alerts });
		}
	}

	getPriceComparison(itemId: string): PriceComparisonResult | null {
		const item = this.dataService.getItemById(itemId);
		if (!item) return null;

		const websitesWithPrices = item.websites
			.filter(
				(website) =>
					website.currentPrice !== undefined && website.isActive
			)
			.map((website) => ({
				websiteId: website.id,
				name: website.name,
				price: website.currentPrice!,
				currency: website.currency,
				url: website.url,
			}))
			.sort((a, b) => a.price - b.price);

		if (websitesWithPrices.length === 0) return null;

		const bestPrice = websitesWithPrices[0];
		const worstPrice = websitesWithPrices[websitesWithPrices.length - 1];

		return {
			itemId,
			websites: websitesWithPrices,
			bestPrice: {
				websiteId: bestPrice.websiteId,
				price: bestPrice.price,
				savings: worstPrice.price - bestPrice.price,
			},
		};
	}

	getPriceHistory(
		itemId: string,
		websiteId?: string,
		days: number = 30
	): PriceHistory[] {
		const item = this.dataService.getItemById(itemId);
		if (!item) return [];

		const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;

		return item.priceHistory
			.filter((entry) => {
				const matchesWebsite =
					!websiteId || entry.websiteId === websiteId;
				const withinTimeRange = entry.timestamp >= cutoffTime;
				return matchesWebsite && withinTimeRange;
			})
			.sort((a, b) => a.timestamp - b.timestamp);
	}

	getPriceStatistics(
		itemId: string,
		websiteId: string
	): {
		current: number | null;
		average: number;
		lowest: number;
		highest: number;
		trend: "up" | "down" | "stable";
		changePercent: number;
	} | null {
		const history = this.getPriceHistory(itemId, websiteId, 30);
		if (history.length === 0) return null;

		const prices = history.map((entry) => entry.price);
		const current = prices[prices.length - 1];
		const previous =
			history.length > 1 ? prices[prices.length - 2] : current;

		const average =
			prices.reduce((sum, price) => sum + price, 0) / prices.length;
		const lowest = Math.min(...prices);
		const highest = Math.max(...prices);

		const changePercent =
			previous > 0 ? ((current - previous) / previous) * 100 : 0;
		let trend: "up" | "down" | "stable" = "stable";

		if (changePercent > 1) trend = "up";
		else if (changePercent < -1) trend = "down";

		return {
			current,
			average: Math.round(average * 100) / 100,
			lowest,
			highest,
			trend,
			changePercent: Math.round(changePercent * 100) / 100,
		};
	}

	// Manual price update
	async manualPriceUpdate(
		itemId: string,
		websiteId: string,
		price: number
	): Promise<void> {
		const item = this.dataService.getItemById(itemId);
		if (!item) return;

		const website = item.websites.find((w) => w.id === websiteId);
		if (!website) return;

		website.currentPrice = price;
		website.lastUpdated = Date.now();

		// Add to price history
		const priceHistoryEntry: PriceHistory = {
			timestamp: Date.now(),
			price: price,
			websiteId: websiteId,
		};
		item.priceHistory.push(priceHistoryEntry);

		await this.dataService.updateItem(itemId, {
			websites: item.websites,
			priceHistory: item.priceHistory,
		});
	}

	// Get price recommendations based on historical data
	getBuyingRecommendation(itemId: string): {
		recommendation: "buy" | "wait" | "uncertain";
		confidence: number;
		reason: string;
		bestWebsite?: string;
	} | null {
		const comparison = this.getPriceComparison(itemId);
		if (!comparison) return null;

		const item = this.dataService.getItemById(itemId);
		if (!item) return null;

		// Analyze price trends for the best website
		const bestWebsite = comparison.bestPrice.websiteId;
		const stats = this.getPriceStatistics(itemId, bestWebsite);

		if (!stats) {
			return {
				recommendation: "uncertain",
				confidence: 0,
				reason: "بيانات غير كافية للتحليل",
			};
		}

		let recommendation: "buy" | "wait" | "uncertain" = "uncertain";
		let confidence = 0;
		let reason = "";

		// Decision logic based on current price vs historical data
		const currentVsLowest =
			((stats.current! - stats.lowest) / stats.lowest) * 100;
		const currentVsAverage =
			((stats.current! - stats.average) / stats.average) * 100;

		if (currentVsLowest <= 5 && stats.trend !== "up") {
			recommendation = "buy";
			confidence = 85;
			reason = "السعر قريب من أدنى مستوى تاريخي والاتجاه مستقر";
		} else if (currentVsAverage <= -10 && stats.trend === "down") {
			recommendation = "buy";
			confidence = 75;
			reason = "السعر أقل من المتوسط والاتجاه هابط";
		} else if (currentVsAverage >= 15 || stats.trend === "up") {
			recommendation = "wait";
			confidence = 70;
			reason = "السعر مرتفع مقارنة بالمتوسط أو في اتجاه صاعد";
		} else {
			recommendation = "uncertain";
			confidence = 50;
			reason = "السعر في المتوسط، قرار الشراء يعتمد على الحاجة";
		}

		return {
			recommendation,
			confidence,
			reason,
			bestWebsite: comparison.websites.find(
				(w) => w.websiteId === bestWebsite
			)?.name,
		};
	}
}
