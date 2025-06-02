import { App, Plugin, TFile } from "obsidian";
import {
	ShoppingItem,
	ItemFilterOptions,
	ItemSortOptions,
} from "../models/ShoppingItem";
import { Category, DEFAULT_CATEGORIES } from "../models/Category";

export interface BuyingListData {
	items: ShoppingItem[];
	categories: Category[];
	settings: {
		defaultCurrency: string;
		priceUpdateInterval: number;
		enableNotifications: boolean;
		theme: "light" | "dark" | "auto";
	};
	version: string;
}

export class DataService {
	private app: App;
	private plugin: Plugin;
	private data: BuyingListData;
	private dataFile: string = "buying-list-data.json";

	constructor(app: App, plugin: Plugin) {
		this.app = app;
		this.plugin = plugin;
		this.data = this.getDefaultData();
	}

	private getDefaultData(): BuyingListData {
		return {
			items: [],
			categories: this.createDefaultCategories(),
			settings: {
				defaultCurrency: "ر.س",
				priceUpdateInterval: 3600000, // 1 hour
				enableNotifications: true,
				theme: "auto",
			},
			version: "1.0.0",
		};
	}

	private createDefaultCategories(): Category[] {
		const now = Date.now();
		return DEFAULT_CATEGORIES.map((cat, index) => ({
			id: `cat_${now}_${index}`,
			name: cat.name!,
			description: cat.description,
			color: cat.color!,
			icon: cat.icon,
			parentId: cat.parentId,
			order: cat.order!,
			isDefault: cat.isDefault!,
			dateCreated: now,
			dateModified: now,
		}));
	}

	async loadData(): Promise<void> {
		try {
			const dataContent = await this.app.vault.adapter.read(
				this.dataFile
			);
			const loadedData = JSON.parse(dataContent) as BuyingListData;

			// Merge with default data in case of missing properties
			this.data = {
				...this.getDefaultData(),
				...loadedData,
				settings: {
					...this.getDefaultData().settings,
					...loadedData.settings,
				},
			};

			// Ensure default categories exist
			if (this.data.categories.length === 0) {
				this.data.categories = this.createDefaultCategories();
			}
		} catch (error) {
			console.log("No existing data found, using defaults");
			this.data = this.getDefaultData();
		}
	}

	async saveData(): Promise<void> {
		try {
			await this.app.vault.adapter.write(
				this.dataFile,
				JSON.stringify(this.data, null, 2)
			);
		} catch (error) {
			console.error("Failed to save buying list data:", error);
		}
	}

	// Item operations
	async addItem(
		item: Omit<ShoppingItem, "id" | "dateAdded" | "dateModified" | "order">
	): Promise<ShoppingItem> {
		const now = Date.now();
		const newItem: ShoppingItem = {
			...item,
			id: `item_${now}_${Math.random().toString(36).substr(2, 9)}`,
			dateAdded: now,
			dateModified: now,
			order: this.data.items.length,
		};

		this.data.items.push(newItem);
		await this.saveData();
		return newItem;
	}

	async updateItem(
		itemId: string,
		updates: Partial<ShoppingItem>
	): Promise<void> {
		const itemIndex = this.data.items.findIndex(
			(item) => item.id === itemId
		);
		if (itemIndex !== -1) {
			this.data.items[itemIndex] = {
				...this.data.items[itemIndex],
				...updates,
				dateModified: Date.now(),
			};
			await this.saveData();
		}
	}

	async deleteItem(itemId: string): Promise<void> {
		this.data.items = this.data.items.filter((item) => item.id !== itemId);
		await this.saveData();
	}

	async reorderItems(itemIds: string[]): Promise<void> {
		// Update order based on new array position
		itemIds.forEach((itemId, index) => {
			const item = this.data.items.find((i) => i.id === itemId);
			if (item) {
				item.order = index;
				item.dateModified = Date.now();
			}
		});

		// Sort items by new order
		this.data.items.sort((a, b) => a.order - b.order);
		await this.saveData();
	}

	getItems(
		filter?: ItemFilterOptions,
		sort?: ItemSortOptions
	): ShoppingItem[] {
		let filteredItems = [...this.data.items];

		// Apply filters
		if (filter) {
			if (filter.categoryIds?.length) {
				filteredItems = filteredItems.filter((item) =>
					filter.categoryIds!.includes(item.categoryId)
				);
			}

			if (filter.status?.length) {
				filteredItems = filteredItems.filter((item) =>
					filter.status!.includes(item.status)
				);
			}

			if (filter.priority?.length) {
				filteredItems = filteredItems.filter((item) =>
					filter.priority!.includes(item.priority)
				);
			}

			if (filter.priceRange) {
				filteredItems = filteredItems.filter((item) => {
					const lowestPrice = this.getLowestPrice(item);
					if (lowestPrice === null) return true;

					const { min, max } = filter.priceRange!;
					return (
						(!min || lowestPrice >= min) &&
						(!max || lowestPrice <= max)
					);
				});
			}

			if (filter.tags?.length) {
				filteredItems = filteredItems.filter((item) =>
					filter.tags!.some((tag) => item.tags.includes(tag))
				);
			}

			if (filter.searchTerm) {
				const term = filter.searchTerm.toLowerCase();
				filteredItems = filteredItems.filter(
					(item) =>
						item.name.toLowerCase().includes(term) ||
						item.description?.toLowerCase().includes(term) ||
						item.notes?.toLowerCase().includes(term)
				);
			}
		}

		// Apply sorting
		if (sort) {
			filteredItems.sort((a, b) => {
				let comparison = 0;

				switch (sort.field) {
					case "name":
						comparison = a.name.localeCompare(b.name, "ar");
						break;
					case "price":
						const priceA = this.getLowestPrice(a) || 0;
						const priceB = this.getLowestPrice(b) || 0;
						comparison = priceA - priceB;
						break;
					case "priority":
						const priorityOrder = { high: 3, medium: 2, low: 1 };
						comparison =
							priorityOrder[a.priority] -
							priorityOrder[b.priority];
						break;
					case "dateAdded":
						comparison = a.dateAdded - b.dateAdded;
						break;
					case "category":
						const catA =
							this.getCategoryById(a.categoryId)?.name || "";
						const catB =
							this.getCategoryById(b.categoryId)?.name || "";
						comparison = catA.localeCompare(catB, "ar");
						break;
					case "order":
						comparison = a.order - b.order;
						break;
				}

				return sort.direction === "desc" ? -comparison : comparison;
			});
		}

		return filteredItems;
	}

	getItemById(itemId: string): ShoppingItem | undefined {
		return this.data.items.find((item) => item.id === itemId);
	}

	private getLowestPrice(item: ShoppingItem): number | null {
		const prices = item.websites
			.filter((website) => website.currentPrice !== undefined)
			.map((website) => website.currentPrice!);

		return prices.length > 0 ? Math.min(...prices) : null;
	}

	// Category operations
	async addCategory(
		category: Omit<Category, "id" | "dateCreated" | "dateModified">
	): Promise<Category> {
		const now = Date.now();
		const newCategory: Category = {
			...category,
			id: `cat_${now}_${Math.random().toString(36).substr(2, 9)}`,
			dateCreated: now,
			dateModified: now,
		};

		this.data.categories.push(newCategory);
		await this.saveData();
		return newCategory;
	}

	async updateCategory(
		categoryId: string,
		updates: Partial<Category>
	): Promise<void> {
		const categoryIndex = this.data.categories.findIndex(
			(cat) => cat.id === categoryId
		);
		if (categoryIndex !== -1) {
			this.data.categories[categoryIndex] = {
				...this.data.categories[categoryIndex],
				...updates,
				dateModified: Date.now(),
			};
			await this.saveData();
		}
	}

	async deleteCategory(categoryId: string): Promise<void> {
		// Don't delete if it's the default category or has items
		const category = this.getCategoryById(categoryId);
		if (!category || category.isDefault) return;

		const hasItems = this.data.items.some(
			(item) => item.categoryId === categoryId
		);
		if (hasItems) return;

		this.data.categories = this.data.categories.filter(
			(cat) => cat.id !== categoryId
		);
		await this.saveData();
	}

	getCategories(): Category[] {
		return [...this.data.categories].sort((a, b) => a.order - b.order);
	}

	getCategoryById(categoryId: string): Category | undefined {
		return this.data.categories.find((cat) => cat.id === categoryId);
	}

	// Settings operations
	async updateSettings(
		settings: Partial<BuyingListData["settings"]>
	): Promise<void> {
		this.data.settings = {
			...this.data.settings,
			...settings,
		};
		await this.saveData();
	}

	getSettings(): BuyingListData["settings"] {
		return this.data.settings;
	}

	// Data export/import
	exportData(): string {
		return JSON.stringify(this.data, null, 2);
	}

	async importData(jsonData: string): Promise<void> {
		try {
			const importedData = JSON.parse(jsonData) as BuyingListData;
			this.data = {
				...this.getDefaultData(),
				...importedData,
				settings: {
					...this.getDefaultData().settings,
					...importedData.settings,
				},
			};
			await this.saveData();
		} catch (error) {
			throw new Error("بيانات غير صحيحة");
		}
	}
}
