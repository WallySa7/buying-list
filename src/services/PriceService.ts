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
	extractedText?: string; // For debugging
	usedSelector?: string; // For debugging
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

	// Enhanced price extraction patterns
	private readonly PRICE_PATTERNS = [
		// Standard decimal formats
		/\d{1,3}(?:[,\s]\d{3})*\.\d{2}/g,
		// Arabic decimal separator
		/\d{1,3}(?:[,\s]\d{3})*٫\d{2}/g,
		// Comma as decimal (European style)
		/\d{1,3}(?:[\.\s]\d{3})*,\d{2}/g,
		// Integer with thousands separators
		/\d{1,3}(?:[,\s.]\d{3})+/g,
		// Simple decimals
		/\d+[\.\,٫]\d{1,2}/g,
		// Large integers (3+ digits)
		/\d{4,}/g,
		// Any number sequence
		/\d+/g,
	];

	// Common price-related attributes to check
	private readonly PRICE_ATTRIBUTES = [
		"data-price",
		"data-amount",
		"data-value",
		"data-cost",
		"content",
		"value",
		"title",
		"aria-label",
		"data-original-price",
		"data-sale-price",
		"data-currency-amount",
	];

	// Currency symbols and their variations
	private readonly CURRENCY_PATTERNS = {
		"ر.س": [/ر\.س/g, /ريال/g, /رس/g, /SAR/gi, /SR/gi],
		$: [/\$/g, /USD/gi, /دولار/g, /dollar/gi],
		"€": [/€/g, /EUR/gi, /يورو/g, /euro/gi],
		"£": [/£/g, /GBP/gi, /جنيه/g, /pound/gi],
		"د.إ": [/د\.إ/g, /درهم/g, /AED/gi, /dirham/gi],
		"ج.م": [/ج\.م/g, /جنيه\s*مصري/g, /EGP/gi],
		"د.ك": [/د\.ك/g, /دينار/g, /KWD/gi, /dinar/gi],
		"ل.ل": [/ل\.ل/g, /ليرة/g, /LBP/gi, /lira/gi],
	};

	// Arabic to Western numeral mapping
	private readonly ARABIC_NUMERALS = {
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
			const extractionResult = await this.scrapePrice(website);

			if (
				extractionResult.success &&
				extractionResult.price !== null &&
				extractionResult.price !== website.currentPrice
			) {
				// Update website price
				website.currentPrice = extractionResult.price;
				website.lastUpdated = Date.now();

				// Add to price history
				const priceHistoryEntry: PriceHistory = {
					timestamp: Date.now(),
					price: extractionResult.price,
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
				await this.checkPriceAlerts(
					item,
					website,
					extractionResult.price
				);

				// Update item
				await this.dataService.updateItem(itemId, {
					websites: item.websites,
					priceHistory: item.priceHistory,
				});

				return {
					websiteId,
					success: true,
					price: extractionResult.price,
					extractedText: extractionResult.extractedText,
					usedSelector: extractionResult.usedSelector,
				};
			}

			return {
				websiteId,
				success: extractionResult.success,
				price: website.currentPrice,
				error: extractionResult.error,
				extractedText: extractionResult.extractedText,
				usedSelector: extractionResult.usedSelector,
			};
		} catch (error) {
			console.error(`Failed to update price for ${website.name}:`, error);
			return {
				websiteId,
				success: false,
				error: error instanceof Error ? error.message : "خطأ غير معروف",
			};
		}
	}

	private async scrapePrice(website: Website): Promise<{
		success: boolean;
		price: number | null;
		error?: string;
		extractedText?: string;
		usedSelector?: string;
	}> {
		try {
			// Enhanced request headers to avoid blocking
			const response = await requestUrl({
				url: website.url,
				method: "GET",
				headers: {
					"User-Agent": this.getRandomUserAgent(),
					Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
					"Accept-Language": "ar,en-US;q=0.9,en;q=0.8",
					"Accept-Encoding": "gzip, deflate",
					Connection: "keep-alive",
					"Upgrade-Insecure-Requests": "1",
					"Sec-Fetch-Dest": "document",
					"Sec-Fetch-Mode": "navigate",
					"Sec-Fetch-Site": "none",
					"Cache-Control": "max-age=0",
				},
			});

			if (response.status !== 200) {
				return {
					success: false,
					price: null,
					error: `HTTP ${response.status}: ${
						response.text || "Unable to fetch page"
					}`,
				};
			}

			const html = response.text;
			if (!html || html.length < 100) {
				return {
					success: false,
					price: null,
					error: "صفحة فارغة أو محتوى غير صحيح",
				};
			}

			// Try enhanced price extraction
			const extractionResult = this.extractPriceFromHtml(
				html,
				website.priceSelector
			);

			return extractionResult;
		} catch (error) {
			console.error(`Error scraping price from ${website.url}:`, error);
			return {
				success: false,
				price: null,
				error: `خطأ في الشبكة: ${
					error instanceof Error ? error.message : "خطأ غير معروف"
				}`,
			};
		}
	}

	private extractPriceFromHtml(
		html: string,
		selectors: string[]
	): {
		success: boolean;
		price: number | null;
		error?: string;
		extractedText?: string;
		usedSelector?: string;
	} {
		try {
			// Create DOM parser
			const parser = new DOMParser();
			const doc = parser.parseFromString(html, "text/html");

			// Remove script and style elements that might contain false prices
			const scriptsAndStyles = doc.querySelectorAll(
				"script, style, noscript"
			);
			scriptsAndStyles.forEach((element) => element.remove());

			// Try each provided selector first
			for (const selector of selectors) {
				const result = this.tryExtractWithSelector(doc, selector);
				if (result.success && result.price !== null) {
					return {
						...result,
						usedSelector: selector,
					};
				}
			}

			// If no selectors worked, try common price selectors
			const commonSelectors = this.getCommonPriceSelectors();
			for (const selector of commonSelectors) {
				const result = this.tryExtractWithSelector(doc, selector);
				if (result.success && result.price !== null) {
					return {
						...result,
						usedSelector: `common: ${selector}`,
					};
				}
			}

			// Last resort: search for price patterns in the entire document
			const bodyText = doc.body ? doc.body.textContent || "" : "";
			const fallbackResult = this.extractPriceFromText(bodyText);
			if (fallbackResult.price !== null) {
				return {
					success: true,
					price: fallbackResult.price,
					extractedText: fallbackResult.extractedText,
					usedSelector: "fallback: document scan",
				};
			}

			return {
				success: false,
				price: null,
				error: "لم يتم العثور على سعر باستخدام أي من الطرق المتاحة",
				extractedText: bodyText.substring(0, 200) + "...",
			};
		} catch (error) {
			console.error("Error parsing HTML:", error);
			return {
				success: false,
				price: null,
				error: `خطأ في تحليل HTML: ${
					error instanceof Error ? error.message : "خطأ غير معروف"
				}`,
			};
		}
	}

	private tryExtractWithSelector(
		doc: Document,
		selector: string
	): {
		success: boolean;
		price: number | null;
		extractedText?: string;
	} {
		try {
			const elements = this.findElementsBySelector(doc, selector);

			for (const element of elements) {
				// Try multiple extraction methods for each element
				const extractionMethods = [
					() => this.extractFromAttributes(element),
					() => this.extractFromTextContent(element),
					() => this.extractFromChildElements(element),
					() => this.extractFromSiblings(element),
				];

				for (const method of extractionMethods) {
					const result = method();
					if (result.price !== null) {
						return {
							success: true,
							price: result.price,
							extractedText: result.extractedText,
						};
					}
				}
			}

			return { success: false, price: null };
		} catch (error) {
			return { success: false, price: null };
		}
	}

	private findElementsBySelector(doc: Document, selector: string): Element[] {
		const elements: Element[] = [];

		try {
			// Try CSS selector first
			const cssResults = doc.querySelectorAll(selector);
			elements.push(...Array.from(cssResults));
		} catch (e) {
			// CSS selector failed, try alternative methods
		}

		// Try ID selector
		if (selector.startsWith("#")) {
			const element = doc.getElementById(selector.slice(1));
			if (element && !elements.includes(element)) {
				elements.push(element);
			}
		}

		// Try class selector
		if (selector.startsWith(".")) {
			const classElements = doc.getElementsByClassName(selector.slice(1));
			Array.from(classElements).forEach((el) => {
				if (!elements.includes(el)) elements.push(el);
			});
		}

		// Try tag selector
		if (
			!selector.includes(".") &&
			!selector.includes("#") &&
			!selector.includes("[")
		) {
			const tagElements = doc.getElementsByTagName(selector);
			Array.from(tagElements).forEach((el) => {
				if (!elements.includes(el)) elements.push(el);
			});
		}

		// Try attribute-based search
		if (selector.includes("[") && selector.includes("]")) {
			const attrMatch = selector.match(/\[([^\]]+)\]/);
			if (attrMatch) {
				const attrQuery = attrMatch[1];
				const allElements = doc.getElementsByTagName("*");
				Array.from(allElements).forEach((el) => {
					if (el.hasAttribute(attrQuery) && !elements.includes(el)) {
						elements.push(el);
					}
				});
			}
		}

		return elements;
	}

	private extractFromAttributes(element: Element): {
		price: number | null;
		extractedText?: string;
	} {
		for (const attr of this.PRICE_ATTRIBUTES) {
			const value = element.getAttribute(attr);
			if (value) {
				const price = this.parsePrice(value);
				if (price !== null) {
					return { price, extractedText: `[${attr}="${value}"]` };
				}
			}
		}
		return { price: null };
	}

	private extractFromTextContent(element: Element): {
		price: number | null;
		extractedText?: string;
	} {
		const text = element.textContent || "";
		const price = this.parsePrice(text);
		if (price !== null) {
			return { price, extractedText: text.trim() };
		}
		return { price: null };
	}

	private extractFromChildElements(element: Element): {
		price: number | null;
		extractedText?: string;
	} {
		// Look for price in child elements
		const priceElements = element.querySelectorAll(
			'[class*="price"], [class*="cost"], [class*="amount"], [data-price], .currency, .money, [class*="سعر"]'
		);

		for (const priceEl of Array.from(priceElements)) {
			const text = priceEl.textContent || "";
			const price = this.parsePrice(text);
			if (price !== null) {
				return { price, extractedText: text.trim() };
			}

			// Check attributes of child elements
			const attrResult = this.extractFromAttributes(priceEl);
			if (attrResult.price !== null) {
				return attrResult;
			}
		}

		return { price: null };
	}

	private extractFromSiblings(element: Element): {
		price: number | null;
		extractedText?: string;
	} {
		// Check siblings for price information
		const siblings = [
			element.previousElementSibling,
			element.nextElementSibling,
		];

		for (const sibling of siblings) {
			if (sibling) {
				const text = sibling.textContent || "";
				const price = this.parsePrice(text);
				if (price !== null) {
					return { price, extractedText: text.trim() };
				}
			}
		}

		return { price: null };
	}

	private extractPriceFromText(text: string): {
		price: number | null;
		extractedText?: string;
	} {
		// Find all potential price matches
		const prices: { price: number; text: string; confidence: number }[] =
			[];

		for (const pattern of this.PRICE_PATTERNS) {
			const matches = text.match(pattern);
			if (matches) {
				for (const match of matches) {
					const price = this.parsePrice(match);
					if (price !== null && price >= 0.01 && price <= 1000000) {
						const confidence = this.calculatePriceConfidence(
							match,
							text
						);
						prices.push({ price, text: match, confidence });
					}
				}
			}
		}

		if (prices.length === 0) {
			return { price: null };
		}

		// Sort by confidence and return the best match
		prices.sort((a, b) => b.confidence - a.confidence);
		return {
			price: prices[0].price,
			extractedText: prices[0].text,
		};
	}

	private calculatePriceConfidence(
		priceText: string,
		context: string
	): number {
		let confidence = 50; // Base confidence

		// Increase confidence if surrounded by price-related words
		const priceKeywords = [
			"price",
			"cost",
			"amount",
			"total",
			"سعر",
			"تكلفة",
			"مبلغ",
			"إجمالي",
			"ريال",
			"دولار",
			"جنيه",
			"درهم",
			"دينار",
			"ر.س",
			"$",
			"€",
			"£",
		];

		const surroundingText = this.getSurroundingText(priceText, context, 50);
		for (const keyword of priceKeywords) {
			if (surroundingText.toLowerCase().includes(keyword.toLowerCase())) {
				confidence += 15;
			}
		}

		// Increase confidence for properly formatted prices
		if (/\d{1,3}(,\d{3})*\.\d{2}/.test(priceText)) confidence += 20;
		if (/\d+\.\d{2}$/.test(priceText)) confidence += 10;
		if (priceText.length >= 4 && priceText.length <= 10) confidence += 10;

		// Decrease confidence for very large or very small numbers
		const numericValue = parseFloat(priceText.replace(/[^\d.]/g, ""));
		if (numericValue < 1 || numericValue > 100000) confidence -= 20;

		return Math.max(0, Math.min(100, confidence));
	}

	private getSurroundingText(
		target: string,
		fullText: string,
		radius: number
	): string {
		const index = fullText.indexOf(target);
		if (index === -1) return "";

		const start = Math.max(0, index - radius);
		const end = Math.min(fullText.length, index + target.length + radius);
		return fullText.substring(start, end);
	}

	private getCommonPriceSelectors(): string[] {
		return [
			// Generic price selectors
			".price",
			"#price",
			"[data-price]",
			".amount",
			".cost",
			".price-now",
			".current-price",
			".sale-price",
			".final-price",
			".product-price",
			".item-price",
			".total-price",

			// Amazon-specific
			".a-price .a-offscreen",
			".a-price-whole",
			".a-price-range",
			"#priceblock_dealprice",
			"#priceblock_ourprice",
			".a-price.a-text-price",

			// Common Arabic e-commerce sites
			".price",
			".price-now",
			".price-current",
			".current-price",
			".product-price",
			".final-price",
			".sale-price",

			// General patterns
			'[class*="price"]',
			'[class*="cost"]',
			'[class*="amount"]',
			'[id*="price"]',
			'[id*="cost"]',
			'[id*="amount"]',
			'span[class*="currency"]',
			'div[class*="money"]',

			// Fallback patterns
			"span",
			"div",
			"p",
			"strong",
			"b",
		];
	}

	private parsePrice(text: string): number | null {
		if (!text || typeof text !== "string") return null;

		// Convert Arabic numerals to Western
		let cleanText = this.convertArabicNumerals(text);

		// Remove common non-numeric characters but keep decimals and thousands separators
		cleanText = cleanText.replace(/[^\d\.,٫\s]/g, " ");

		// Extract potential price numbers using enhanced patterns
		const prices: number[] = [];

		for (const pattern of this.PRICE_PATTERNS) {
			const matches = cleanText.match(pattern);
			if (matches) {
				for (const match of matches) {
					const normalized = this.normalizeNumber(match.trim());
					const num = parseFloat(normalized);
					if (!isNaN(num) && num > 0 && num <= 1000000) {
						prices.push(num);
					}
				}
				// If we found valid prices with this pattern, use them
				if (prices.length > 0) break;
			}
		}

		if (prices.length === 0) return null;

		// Return the most reasonable price (usually the largest one within reasonable bounds)
		const reasonablePrices = prices.filter((p) => p >= 0.01 && p <= 100000);
		if (reasonablePrices.length === 0) return null;

		// If multiple prices, prefer the one that looks most like a retail price
		if (reasonablePrices.length > 1) {
			// Prefer prices with 2 decimal places or round numbers
			const precisionPrices = reasonablePrices.filter(
				(p) => p % 1 === 0 || (p * 100) % 1 === 0
			);
			if (precisionPrices.length > 0) {
				return Math.max(...precisionPrices);
			}
		}

		return Math.max(...reasonablePrices);
	}

	private convertArabicNumerals(text: string): string {
		let result = text;
		for (const [arabic, western] of Object.entries(this.ARABIC_NUMERALS)) {
			result = result.replace(new RegExp(arabic, "g"), western);
		}
		return result;
	}

	private normalizeNumber(numberStr: string): string {
		if (!numberStr) return "0";

		// Remove extra spaces
		let normalized = numberStr.replace(/\s+/g, "");

		// Handle Arabic decimal separator
		if (normalized.includes("٫")) {
			const parts = normalized.split("٫");
			if (parts.length === 2) {
				const intPart = parts[0].replace(/[,\.]/g, "");
				normalized = intPart + "." + parts[1];
			}
		}
		// Handle European format (comma as decimal)
		else if (normalized.match(/^\d{1,3}(\.\d{3})*,\d{2}$/)) {
			normalized = normalized.replace(/\./g, "").replace(",", ".");
		}
		// Handle US format (comma as thousands separator)
		else if (normalized.match(/^\d{1,3}(,\d{3})*(\.\d{2})?$/)) {
			normalized = normalized.replace(/,/g, "");
		}
		// Handle space as thousands separator
		else if (normalized.match(/^\d{1,3}(\s\d{3})*([,\.]\d{2})?$/)) {
			normalized = normalized.replace(/\s/g, "").replace(",", ".");
		}
		// Handle mixed separators - determine decimal separator by position
		else if (normalized.includes(",") && normalized.includes(".")) {
			const lastComma = normalized.lastIndexOf(",");
			const lastDot = normalized.lastIndexOf(".");

			if (lastDot > lastComma) {
				// Dot is decimal separator
				normalized = normalized.replace(/,/g, "");
			} else {
				// Comma is decimal separator
				normalized = normalized.replace(/\./g, "").replace(",", ".");
			}
		}
		// Single comma - check if it's decimal or thousands
		else if (normalized.includes(",") && !normalized.includes(".")) {
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

	private getRandomUserAgent(): string {
		const userAgents = [
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Edge/120.0.0.0",
			"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0",
		];
		return userAgents[Math.floor(Math.random() * userAgents.length)];
	}

	// [Rest of the class methods remain the same as in the original code]
	// checkPriceAlerts, addPriceAlert, removePriceAlert, togglePriceAlert,
	// getPriceComparison, getPriceHistory, getPriceStatistics,
	// manualPriceUpdate, getBuyingRecommendation

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
