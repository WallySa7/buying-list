import { Plugin, WorkspaceLeaf } from "obsidian";
import {
	BuyingListView,
	VIEW_TYPE_BUYING_LIST,
} from "./src/views/BuyingListView";
import { DataService } from "./src/services/DataService";
import { PriceService } from "./src/services/PriceService";

export default class BuyingListPlugin extends Plugin {
	dataService: DataService;
	priceService: PriceService;

	async onload() {
		console.log("Loading Buying List plugin");

		// Initialize services
		this.dataService = new DataService(this.app, this);
		this.priceService = new PriceService(this.app, this);

		// Link services
		this.priceService.setDataService(this.dataService);

		// Register view
		this.registerView(
			VIEW_TYPE_BUYING_LIST,
			(leaf) => new BuyingListView(leaf, this)
		);

		// Add ribbon icon
		this.addRibbonIcon("shopping-cart", "قائمة التسوق", () => {
			this.activateView();
		});

		// Add command
		this.addCommand({
			id: "open-buying-list",
			name: "فتح قائمة التسوق",
			callback: () => {
				this.activateView();
			},
		});

		// Load data
		await this.dataService.loadData();

		// Start price monitoring
		this.priceService.startPriceMonitoring();
	}

	async onunload() {
		console.log("Unloading Buying List plugin");

		// Stop price monitoring
		this.priceService.stopPriceMonitoring();

		// Save data
		await this.dataService.saveData();
	}

	async activateView() {
		const { workspace } = this.app;

		let leaf: WorkspaceLeaf | null = null;
		const leaves = workspace.getLeavesOfType(VIEW_TYPE_BUYING_LIST);

		if (leaves.length > 0) {
			// A leaf with our view already exists, use that
			leaf = leaves[0];
		} else {
			// Our view could not be found, create a new leaf in the main area
			leaf = workspace.getLeaf("tab");
			await leaf.setViewState({
				type: VIEW_TYPE_BUYING_LIST,
				active: true,
			});
		}

		// Reveal the leaf in case it is in a folded sidebar
		workspace.revealLeaf(leaf);
	}
}
