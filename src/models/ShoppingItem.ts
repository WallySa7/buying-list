export interface Website {
	id: string;
	name: string;
	url: string;
	priceSelector: string[]; // Multiple selectors for better scraping
	currentPrice?: number;
	currency: string;
	lastUpdated?: number;
	isActive: boolean;
}

export interface PriceHistory {
	timestamp: number;
	price: number;
	websiteId: string;
}

export interface PriceAlert {
	id: string;
	websiteId: string;
	targetPrice: number;
	isActive: boolean;
	condition: "below" | "above" | "equal";
}

export interface ShoppingItem {
	id: string;
	name: string;
	description?: string;
	categoryId: string;
	websites: Website[];
	priceHistory: PriceHistory[];
	alerts: PriceAlert[];
	priority: "low" | "medium" | "high";
	status: "wishlist" | "needed" | "purchased";
	tags: string[];
	notes?: string;
	dateAdded: number;
	dateModified: number;
	order: number; // For reordering
	image?: string;
	targetBudget?: number;
	quantity?: number;
}

export interface ItemSortOptions {
	field: "name" | "price" | "priority" | "dateAdded" | "category" | "order";
	direction: "asc" | "desc";
}

export interface ItemFilterOptions {
	categoryIds?: string[];
	status?: string[];
	priority?: string[];
	priceRange?: {
		min?: number;
		max?: number;
	};
	tags?: string[];
	searchTerm?: string;
}
