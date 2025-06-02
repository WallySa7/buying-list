export interface Category {
	id: string;
	name: string;
	description?: string;
	color: string;
	icon?: string;
	parentId?: string; // For subcategories
	order: number;
	isDefault: boolean;
	dateCreated: number;
	dateModified: number;
}

export const DEFAULT_CATEGORIES: Partial<Category>[] = [
	{
		name: "إلكترونيات",
		color: "#3b82f6",
		icon: "📱",
		isDefault: true,
		order: 1,
	},
	{
		name: "ملابس",
		color: "#10b981",
		icon: "👕",
		isDefault: true,
		order: 2,
	},
	{
		name: "طعام ومشروبات",
		color: "#f59e0b",
		icon: "🍕",
		isDefault: true,
		order: 3,
	},
	{
		name: "منزل وحديقة",
		color: "#8b5cf6",
		icon: "🏠",
		isDefault: true,
		order: 4,
	},
	{
		name: "كتب",
		color: "#06b6d4",
		icon: "📚",
		isDefault: true,
		order: 5,
	},
	{
		name: "رياضة وترفيه",
		color: "#ef4444",
		icon: "⚽",
		isDefault: true,
		order: 6,
	},
	{
		name: "صحة وجمال",
		color: "#ec4899",
		icon: "💄",
		isDefault: true,
		order: 7,
	},
	{
		name: "أخرى",
		color: "#6b7280",
		icon: "📦",
		isDefault: true,
		order: 999,
	},
];

export interface CategoryStats {
	totalItems: number;
	totalValue: number;
	averagePrice: number;
	highestPrice: number;
	lowestPrice: number;
}
