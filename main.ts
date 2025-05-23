import {
	App,
	ItemView,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TAbstractFile,
	TFile,
	getIcon,
	Modal,
} from "obsidian";
import OpenAI from "openai";

const AUTO_UPDATE_DAILY_NOTE = "autoUpdateDailyNote";
const DAYS = [
	"Sunday",
	"Monday",
	"Tuesday",
	"Wednesday",
	"Thursday",
	"Friday",
	"Saturday",
];

interface CanvasView extends ItemView {
	canvas: Canvas;
}

interface Canvas {
	cardMenuEl: HTMLElement;
	nodes: CanvasNode[];
	removeNode(node: CanvasNode): void;
	requestSave(): void;
	createFileNode(options: any): CanvasNode;
	createTextNode(options: any): CanvasNode;
	createLinkNode(options: any): CanvasNode;
	createGroupNode(options: any): CanvasNode;
	deselectAll(): void;
	addNode(node: CanvasNode): void;
}

interface CanvasNode {
	unknownData: UnknownData;
	nodeEl: HTMLElement;
	file: TFile;
	x: number;
	y: number;
	width: number;
	height: number;
}

interface UnknownData {
	nodeType: string;
}

interface CanvasDailyNotePluginSettings {
	createIfNotExists: boolean;
	skipMonday: boolean;
	skipTuesday: boolean;
	skipWednesday: boolean;
	skipThursday: boolean;
	skipFriday: boolean;
	skipSaturday: boolean;
	skipSunday: boolean;
	openaiApiKey: string;
}

const DEFAULT_SETTINGS: CanvasDailyNotePluginSettings = {
	createIfNotExists: false,
	skipMonday: false,
	skipTuesday: false,
	skipWednesday: false,
	skipThursday: false,
	skipFriday: false,
	skipSaturday: false,
	skipSunday: false,
	openaiApiKey: "",
};

interface DailyNotePluginOptions {
	folder: string;
}

interface DailyNotePlugin {
	getDailyNote(): TFile;
	options: DailyNotePluginOptions;
}

// MY TYPES 

type Activity = 
	| {
		type: "youtube";
		url: string;
	}
	| {
		type: "webpage";
		url: string;
	}
	| {
		type: "create-flashcards";
		scaffold: string;
	}
	| {
		type: "writing-activity";
		scaffold: string;
	}
	| {
		type: "dialogue-tutoring";
		systemPrompt: string;
	}
	| {
		type: "llm-graph";
		prompt: string;
	};

type Position = {
	x: number;
	y: number;
}

class TextInputModal extends Modal {
	private text: string = "";
	private resolvePromise: (value: string | null) => void;
	private inputEl: HTMLInputElement;

	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Enter text for the node" });

		this.inputEl = contentEl.createEl("input", {
			type: "text",
			value: this.text
		});

		this.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				this.text = this.inputEl.value;
				this.close();
			}
		});

		const buttonContainer = contentEl.createDiv({
			cls: "modal-button-container"
		});

		buttonContainer.createEl("button", {
			text: "Cancel",
			cls: "mod-warning"
		}).addEventListener("click", () => {
			this.close();
		});

		buttonContainer.createEl("button", {
			text: "Submit",
			cls: "mod-cta"
		}).addEventListener("click", () => {
			this.text = this.inputEl.value;
			this.close();
		});

		this.inputEl.focus();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		this.resolvePromise(this.text || null);
	}

	async open(): Promise<string | null> {
		return new Promise((resolve) => {
			this.resolvePromise = resolve;
			super.open();
		});
	}
}

class ActivityModal extends Modal {
	private resolvePromise: (value: any | null) => void;
	private inputEl: HTMLInputElement;
	private type: Activity["type"];

	constructor(app: App, type: Activity["type"]) {
		super(app);
		this.type = type;
	}

	onOpen() {
		const { contentEl } = this;
		let title = "";
		let placeholder = "";

		switch (this.type) {
			case "youtube":
				title = "Add YouTube Activity";
				placeholder = "Enter YouTube URL";
				break;
			case "webpage":
				title = "Add Webpage Activity";
				placeholder = "Enter webpage URL";
				break;
			case "create-flashcards":
				title = "Add Flashcard Activity";
				placeholder = "Enter flashcard scaffold";
				break;
			case "writing-activity":
				title = "Add Writing Activity";
				placeholder = "Enter writing scaffold";
				break;
			case "dialogue-tutoring":
				title = "Add Dialogue Tutoring";
				placeholder = "Enter system prompt";
				break;
		}

		contentEl.createEl("h2", { text: title });

		this.inputEl = contentEl.createEl("input", {
			type: "text",
			attr: { placeholder }
		});

		this.inputEl.addEventListener("keydown", (e) => {
			if (e.key === "Enter") {
				this.submit();
			}
		});

		const buttonContainer = contentEl.createDiv({
			cls: "modal-button-container"
		});

		buttonContainer.createEl("button", {
			text: "Cancel",
			cls: "mod-warning"
		}).addEventListener("click", () => {
			this.close();
		});

		buttonContainer.createEl("button", {
			text: "Submit",
			cls: "mod-cta"
		}).addEventListener("click", () => {
			this.submit();
		});

		this.inputEl.focus();
	}

	private submit() {
		const value = this.inputEl.value;
		if (!value) return;

		let activity: Activity;
		switch (this.type) {
			case "youtube":
			case "webpage":
				activity = { type: this.type, url: value };
				break;
			case "create-flashcards":
			case "writing-activity":
				activity = { type: this.type, scaffold: value };
				break;
			case "dialogue-tutoring":
				activity = { type: this.type, systemPrompt: value };
				break;
			default:
				return;
		}
		console.log("Activity created in modal:", activity); // Debug log
		this.resolvePromise(activity);
		this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	async open(): Promise<Activity | null> {
		return new Promise((resolve) => {
			this.resolvePromise = resolve;
			super.open();
		});
	}
}

class MultiActivityModal extends Modal {
	private resolvePromise: (value: Activity[] | null) => void;
	public containerEl: HTMLElement;

	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		this.containerEl = contentEl;
		contentEl.createEl("h2", { text: "Create Multiple Activities" });

		// Container for activity inputs
		const activitiesDiv = contentEl.createDiv({ cls: "multi-activities-list" });
		this.addActivityInput(activitiesDiv);

		// Add button to add more activities
		const addButton = contentEl.createEl("button", {
			text: "Add Another Activity",
			cls: "mod-cta"
		});
		addButton.addEventListener("click", () => {
			this.addActivityInput(activitiesDiv);
		});

		// Add submit button
		const submitButton = contentEl.createEl("button", {
			text: "Create Activities",
			cls: "mod-cta"
		});
		submitButton.addEventListener("click", () => {
			this.submit(activitiesDiv);
		});
	}

	private addActivityInput(parent: HTMLElement) {
		const activityContainer = parent.createDiv({ cls: "activity-input-container" });

		// Activity type selector
		const typeSelect = activityContainer.createEl("select");
		const activityTypes: Activity["type"][] = [
			"youtube",
			"webpage",
			"create-flashcards",
			"writing-activity",
			"dialogue-tutoring"
		];
		activityTypes.forEach(type => {
			typeSelect.createEl("option", {
				text: type.replace(/-/g, " ").replace(/\b\w/g, l => l.toUpperCase()),
				value: type
			});
		});

		// Input field
		const input = activityContainer.createEl("input", {
			type: "text",
			attr: { placeholder: "Enter value" }
		});

		// Remove button
		const removeButton = activityContainer.createEl("button", {
			text: "Remove",
			cls: "mod-warning"
		});
		removeButton.addEventListener("click", () => {
			activityContainer.remove();
		});

		// Update input placeholder based on type
		typeSelect.addEventListener("change", () => {
			const type = typeSelect.value as Activity["type"];
			switch (type) {
				case "youtube":
					input.placeholder = "Enter YouTube URL";
					break;
				case "webpage":
					input.placeholder = "Enter webpage URL";
					break;
				case "create-flashcards":
					input.placeholder = "Enter flashcard scaffold";
					break;
				case "writing-activity":
					input.placeholder = "Enter writing scaffold";
					break;
				case "dialogue-tutoring":
					input.placeholder = "Enter system prompt";
					break;
			}
		});
	}

	private submit(parent: HTMLElement) {
		const activityContainers = parent.querySelectorAll(".activity-input-container");
		const activities: Activity[] = [];
		activityContainers.forEach(container => {
			const type = (container.querySelector("select") as HTMLSelectElement).value as Activity["type"];
			const value = (container.querySelector("input") as HTMLInputElement).value;
			if (!value) return;
			
			let activity: Activity;
			switch (type) {
				case "youtube":
				case "webpage":
					activity = { type, url: value };
					break;
				case "create-flashcards":
				case "writing-activity":
					activity = { type, scaffold: value };
					break;
				case "dialogue-tutoring":
					activity = { type, systemPrompt: value };
					break;
				default:
					return;
			}
			activities.push(activity);
		});
		this.resolvePromise(activities.length > 0 ? activities : null);
		this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
		if (this.resolvePromise) {
			this.resolvePromise(null);
		}
	}

	async open(): Promise<Activity[] | null> {
		return new Promise((resolve) => {
			this.resolvePromise = resolve;
			super.open();
		});
	}
}

class LLMGraphModal extends Modal {
	private resolvePromise: (value: Activity | null) => void;
	private goalInputEl: HTMLTextAreaElement;
	private strategyInputEl: HTMLTextAreaElement;

	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h2", { text: "Pedagogical Learning Orchestrator" });
		
		contentEl.createEl("p", { 
			text: "Using principles from learning science and the Knowledge-Learning-Instruction (KLI) framework, I will analyze your goals and preferences to create a personalized sequence of learning activities. This will help optimize your learning experience by incorporating evidence-based strategies and scaffolding techniques.",
			attr: {
				style: "margin-bottom: 20px; line-height: 1.5;"
			}
		});

		// First text area for goals
		contentEl.createEl("h3", { text: "What is your goal for studying today?" });
		this.goalInputEl = contentEl.createEl("textarea", {
			attr: {
				placeholder: "Enter your study goals...",
				rows: "6",
				style: "width: 100%; margin-bottom: 20px;"
			}
		});

		// Second text area for strategies
		contentEl.createEl("h3", { text: "Do you have any ideas for strategies you would like to follow?" });
		this.strategyInputEl = contentEl.createEl("textarea", {
			attr: {
				placeholder: "Enter your preferred study strategies...",
				rows: "6",
				style: "width: 100%; margin-bottom: 20px;"
			}
		});

		const buttonContainer = contentEl.createDiv({
			cls: "modal-button-container"
		});

		buttonContainer.createEl("button", {
			text: "Generate Study Plan",
			cls: "mod-cta"
		}).addEventListener("click", () => {
			this.submit();
		});

		this.goalInputEl.focus();
	}

	private submit() {
		const goalText = this.goalInputEl.value;
		const strategyText = this.strategyInputEl.value;
		
		if (!goalText && !strategyText) return;

		const activity: Activity = {
			type: "llm-graph",
			prompt: `Goals: ${goalText}\n\nStrategies: ${strategyText}`
		};
		this.resolvePromise(activity);
		this.close();
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	async open(): Promise<Activity | null> {
		return new Promise((resolve) => {
			this.resolvePromise = resolve;
			super.open();
		});
	}
}

/**
 * This allows a "live-reload" of Obsidian when developing the plugin.
 * Any changes to the code will force reload Obsidian.
 */
// if (process.env.NODE_ENV === "development") {
// 	new EventSource("http://127.0.0.1:8000/esbuild").addEventListener(
// 		"change",
// 		() => location.reload()
// 	);
// }

export default class CanvasDailyNotePlugin extends Plugin {
	settings: CanvasDailyNotePluginSettings;
	dailyNotePlugin: DailyNotePlugin;

	async onload() {
		await this.loadSettings();

		// Get an instance of the daily notes plugin so we can interact with it
		this.dailyNotePlugin = (this.app as any).internalPlugins.getPluginById(
			"daily-notes"
		)?.instance;

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new CanvasDailyNotePluginSettingTab(this.app, this));

		// Hook into the file open event
		this.registerEvent(
			this.app.workspace.on("file-open", this.handleFileOpen.bind(this))
		);

		this.addCommand({
			id: 'add-text-node',
			name: 'Add Text Node',
			callback: async () => {
				const canvasView = this.app.workspace.getActiveViewOfType(ItemView) as CanvasView;
				if (canvasView?.getViewType() !== "canvas") {
					new Notice("Please open a canvas first");
					return;
				}

				const modal = new TextInputModal(this.app);
				const text = await modal.open();
				if (!text) return; // User cancelled the prompt

				const canvas = canvasView.canvas;
				const node = canvas.createTextNode({
					pos: {
						x: 0,
						y: 0,
						height: 200,
						width: 300,
					},
					size: {
						x: 0,
						y: 0,
						height: 200,
						width: 300,
					},
					text: text,
					focus: true,
					save: true,
				});

				canvas.deselectAll();
				canvas.addNode(node);
				canvas.requestSave();
			},
		});
	}

	async createActivity(activity: Activity, startPosition: Position): Promise<number> {
		console.log("createActivity called with:", activity); // Debug log
		
		const canvasView = this.app.workspace.getActiveViewOfType(ItemView) as CanvasView;
		if (canvasView?.getViewType() !== "canvas") {
			new Notice("Please open a canvas first");
			return 0;
		}

		const canvas = canvasView.canvas;
		let node: CanvasNode;
		let width: number;
		let height: number;

		// Calculate position based on existing nodes
		let x = startPosition.x;
		let y = startPosition.y;
		
		// If there are existing nodes, find the rightmost node and position accordingly
		if (canvas.nodes.length > 0) {
			const rightmostNode = canvas.nodes.reduce((rightmost, node) => {
				return node.x > rightmost.x ? node : rightmost;
			}, canvas.nodes[0]);
			x = rightmostNode.x + rightmostNode.width + 100; // Consistent spacing
			y = rightmostNode.y; // Keep same y-level for row
		}

		console.log("Creating node for activity type:", activity.type); // Debug log

		switch (activity.type) {
			case "youtube":
				width = 640;
				height = 360;

				// Create the video node
				node = canvas.createLinkNode({
					pos: {
						x: x,
						y: y,
						height: height,
						width: width,
					},
					size: {
						x: x,
						y: y,
						height: height,
						width: width,
					},
					url: activity.url,
					focus: true,
					save: true,
				});

				// Create a notes node below the video
				const notesNode = canvas.createTextNode({
					pos: {
						x: x,
						y: y + height + 20,
						height: 200,
						width: width, // Same width as video
					},
					size: {
						x: x,
						y: y + height + 20,
						height: 200,
						width: width, // Same width as video
					},
					text: "Notes for this video:\n\n",
					focus: false,
					save: true,
				});

				canvas.deselectAll();
				canvas.addNode(node);
				canvas.addNode(notesNode);
				canvas.requestSave();
				return x + width;

			case "webpage":
				width = 500;
				height = 800;

				// Create the webpage node
				node = canvas.createLinkNode({
					pos: {
						x: x,
						y: y,
						height: height,
						width: width,
					},
					size: {
						x: x,
						y: y,
						height: height,
						width: width,
					},
					url: activity.url,
					focus: true,
					save: true,
				});

				// Create a notes node to the right of the webpage
				const webpageNotesNode = canvas.createTextNode({
					pos: {
						x: x + width + 20, // Position to the right
						y: y,
						height: height, // Same height as webpage
						width: width, // Same width as webpage
					},
					size: {
						x: x + width + 20,
						y: y,
						height: height,
						width: width,
					},
					text: "Notes for this webpage:\n\n",
					focus: false,
					save: true,
				});

				canvas.deselectAll();
				canvas.addNode(node);
				canvas.addNode(webpageNotesNode);
				canvas.requestSave();
				return x + width + width + 20; // Return position including the notes node

			case "create-flashcards":
				width = 800;
				height = 800;

				node = canvas.createTextNode({
					pos: {
						x: x,
						y: y,
						height: height,
						width: width,
					},
					size: {
						x: x,
						y: y,
						height: height,
						width: width,
					},
					text: activity.scaffold,
					focus: true,
					save: true,
				});
				break;
			case "writing-activity":
				width = 800;
				height = 800;

				node = canvas.createTextNode({
					pos: {
						x: x,
						y: y,
						height: height,
						width: width,
					},
					size: {
						x: x,
						y: y,
						height: height,
						width: width,
					},
					text: activity.scaffold,
					focus: true,
					save: true,
				});
				break;
			case "dialogue-tutoring":
				width = 900;
				height = 800;

				node = canvas.createLinkNode({
					pos: {
						x: x,
						y: y,
						height: height,
						width: width,
					},
					size: {
						x: x,
						y: y,
						height: height,
						width: width,
					},
					url: 'https://chat.openai.com/?q=' + encodeURIComponent(activity.systemPrompt),
					focus: true,
					save: true,
				});
				break;
			case "llm-graph":
				width = 400;
				height = 300;

				// Create initial node showing processing
				node = canvas.createTextNode({
					pos: {
						x: x,
						y: y,
						height: height,
						width: width,
					},
					size: {
						x: x,
						y: y,
						height: height,
						width: width,
					},
					text: "Processing your learning plan...\n\n" + activity.prompt,
					focus: true,
					save: true,
				});

				canvas.deselectAll();
				canvas.addNode(node);
				canvas.requestSave();

				// Generate activities using OpenAI
				const [goals, strategies] = activity.prompt.split("\n\n");
				const activities = await this.generateLearningActivities(goals, strategies);

				// Create nodes for each activity in a single row
				let currentX = x + width + 100; // Start after the initial node
				let currentY = y; // Keep same y-level

				for (const generatedActivity of activities) {
					const result = await this.createActivity(generatedActivity, { x: currentX, y: currentY });
					currentX = result + 100; // Consistent spacing
				}

				return x + width;
		}

		console.log("Node created:", node); // Debug log

		canvas.deselectAll();
		canvas.addNode(node);
		canvas.requestSave();
		return x + width;
	}

	/**
	 * When a file is opened, we check if the file is a canvas. If it is, we'll hook into it.
	 */
	async handleFileOpen() {
		const canvasView = this.app.workspace.getActiveViewOfType(
			ItemView
		) as CanvasView;

		// Only need to run this code if we're looking at a canvas
		if (canvasView?.getViewType() !== "canvas") {
			return;
		}

		const canvas = canvasView?.canvas;
		this.createButton(canvas);
		this.processCanvasNodes(canvas);
	}

	/**
	 * Add a new button to the card UI at the bottom. Clicking the button will attempt to add a daily note to the canvas.
	 * @param canvas
	 */
	createButton(canvas: Canvas) {
		const cardMenuEl = canvas.cardMenuEl;

		// Only create the canvas button if it doesn't already exist
		if (!cardMenuEl.querySelector(".canvas-button-adddailynote")) {
			const button = cardMenuEl.createEl("div", {
				attr: {
					class: "canvas-card-menu-button canvas-button-adddailynote",
				},
			});

			const icon = getIcon("calendar");
			if (icon) {
				button.appendChild(icon);
				button.addEventListener("click", async () => {
					let dailyFile = this.getExistingDailyFile();
					if (!dailyFile && !this.settings.createIfNotExists) {
						new Notice(
							"Daily note currently does not exist and plugin settings are set to not create it."
						);
						return;
					}

					// Don't create note on days that are configured to be skipped
					const dayOfTheWeek = DAYS[new Date().getDay()];
					// @ts-ignore
					if (!dailyFile && this.settings[`skip${dayOfTheWeek}`]) {
						new Notice(
							`Daily note currently does not exist and plugin settings are set to not create it on ${dayOfTheWeek}.`
						);
						return;
					}

					// This will either get the existing note or create a new one. Either way, returns the file.
					dailyFile = await this.dailyNotePlugin.getDailyNote();

					if (dailyFile instanceof TFile) {
						this.addDailyNote(canvas, dailyFile);
					}
				});
			}
		}

		// Add activity buttons
		const activityTypes: Activity["type"][] = [
			"youtube",
			"webpage",
			"create-flashcards",
			"writing-activity",
			"dialogue-tutoring",
			"llm-graph"
		];

		activityTypes.forEach(type => {
			const buttonId = `canvas-button-${type}`;
			if (!cardMenuEl.querySelector(`.${buttonId}`)) {
				const button = cardMenuEl.createEl("div", {
					attr: {
						class: `canvas-card-menu-button ${buttonId}`,
					},
				});

				let iconName = "";
				switch (type) {
					case "youtube":
						iconName = "video";
						break;
					case "webpage":
						iconName = "link";
						break;
					case "create-flashcards":
						iconName = "book";
						break;
					case "writing-activity":
						iconName = "edit";
						break;
					case "dialogue-tutoring":
						iconName = "message-circle";
						break;
					case "llm-graph":
						iconName = "brain";
						break;
				}

				const icon = getIcon(iconName);
				if (icon) {
					button.appendChild(icon);
					button.addEventListener("click", async () => {
						console.log("Button clicked for type:", type); // Debug log
						if (type === "llm-graph") {
							const modal = new LLMGraphModal(this.app);
							const activity = await modal.open();
							console.log("Activity returned from modal:", activity); // Debug log
							if (activity) {
								await this.createActivity(activity, { x: 0, y: 0 });
							}
						} else {
							const modal = new ActivityModal(this.app, type);
							const activity = await modal.open();
							console.log("Activity returned from modal:", activity); // Debug log
							if (activity) {
								await this.createActivity(activity, { x: 0, y: 0 });
							}
						}
					});
				}
			}
		});

		// Add multi-activity button
		if (!cardMenuEl.querySelector(".canvas-button-multiactivity")) {
			const button = cardMenuEl.createEl("div", {
				attr: {
					class: "canvas-card-menu-button canvas-button-multiactivity",
				},
			});
			const icon = getIcon("workflow") || getIcon("list");
			if (icon) button.appendChild(icon);
			button.title = "Create Multiple Activities";
			button.addEventListener("click", async () => {
				const modal = new MultiActivityModal(this.app);
				const activities = await modal.open();
				if (activities && activities.length > 0) {
					const canvasView = this.app.workspace.getActiveViewOfType(ItemView) as CanvasView;
					if (canvasView?.getViewType() !== "canvas") {
						new Notice("Please open a canvas first");
						return;
					}
					const canvas = canvasView.canvas;
					let currentX = 0;
					let currentY = 0;
					for (const activity of activities) {
						await this.createActivity(activity, { x: currentX, y: currentY });
						currentX += 450; // space nodes horizontally
					}
				}
			});
		}
	}

	/**
	 * This services two purposes
	 * 1. Adding a styling class to the daily note nodes
	 * 2. Updating any out of date daily note nodes with today's note
	 * @param canvas
	 */
	processCanvasNodes(canvas: Canvas) {
		let dailyFile = this.getExistingDailyFile();

		canvas.nodes.forEach(async (node) => {
			if (node.unknownData.nodeType !== AUTO_UPDATE_DAILY_NOTE) {
				return;
			}
			// Add class to each found auto daily note
			node.nodeEl.addClass("canvas-node-dailynote");

			// If the note is out of date, replace it with a new daily note node in the same x/y with the same width/height
			if (node?.file?.path !== dailyFile?.path || !node.file) {
				if (!dailyFile && !this.settings.createIfNotExists) {
					return;
				}

				const dayOfTheWeek = DAYS[new Date().getDay()];
				// @ts-ignore
				if (!dailyFile && this.settings[`skip${dayOfTheWeek}`]) {
					return;
				}

				canvas.removeNode(node);
				canvas.requestSave();

				dailyFile = await this.dailyNotePlugin.getDailyNote();

				if (dailyFile instanceof TFile) {
					this.addDailyNote(canvas, dailyFile, {
						x: node.x,
						y: node.y,
						width: node.width,
						height: node.height,
					});
				}
			}
		});
	}

	/**
	 * Gets the existing daily note based on the daily notes plugin settings or returns null if it does not exist.
	 */
	getExistingDailyFile(): TFile | TAbstractFile | null | undefined {
		const dailyFolder = this.dailyNotePlugin.options.folder;
		const expectedNotePath = `${dailyFolder.replace(
			/^\/|\\/,
			""
		)}/${new Date().getFullYear()}-${String(
			new Date().getMonth() + 1
		).padStart(2, "0")}-${String(new Date().getDate()).padStart(
			2,
			"0"
		)}.md`;
		let dailyFile = this.app.vault.getAbstractFileByPath(expectedNotePath);

		return dailyFile;
	}

	/**
	 * Adds the Daily Note node to the canvas. Stores a special "nodeType" property so we can identify it later.
	 * @param canvas
	 * @param dailyFile
	 * @param options
	 */
	addDailyNote(canvas: Canvas, dailyFile: TFile, options: any = {}) {
		const dailyFileNode = canvas.createFileNode({
			pos: {
				x: options.x || 0,
				y: options.y || 0,
				height: options.height || 500,
				width: options.width || 500,
			},
			size: {
				x: options.x || 0,
				y: options.y || 0,
				height: options.height || 500,
				width: options.width || 500,
			},
			file: dailyFile,
			path: this.dailyNotePlugin.options.folder,
			focus: false,
			save: true,
		});
		dailyFileNode.unknownData.nodeType = AUTO_UPDATE_DAILY_NOTE;
		canvas.deselectAll();
		canvas.addNode(dailyFileNode);
		canvas.requestSave();
	}

	onunload() {}

	/**
	 * Load data from disk, stored in data.json in plugin folder
	 */
	async loadSettings() {
		const data = (await this.loadData()) || {};
		this.settings = Object.assign({}, DEFAULT_SETTINGS, data);
	}

	/**
	 * Save data to disk, stored in data.json in plugin folder
	 */
	async saveSettings() {
		await this.saveData(this.settings);
	}

	async generateLearningActivities(goals: string, strategies: string): Promise<Activity[]> {
		if (!this.settings.openaiApiKey) {
			new Notice("Please add your OpenAI API key in the plugin settings");
			return [];
		}

		const openai = new OpenAI({
			apiKey: this.settings.openaiApiKey,
			dangerouslyAllowBrowser: true,
		});

		const prompt = `You are a pedagogical learning orchestrator using the Knowledge-Learning-Instruction (KLI) framework.
Based on the following learning goals and preferred strategies, create a sequence of learning activities.

Learning Goals:
${goals}

Preferred Strategies:
${strategies}

Please analyze these inputs and create a sequence of activities that will help achieve the learning goals.
Consider:
1. Knowledge acquisition and understanding
2. Practice and application
3. Feedback and reflection
4. Metacognitive strategies

IMPORTANT GUIDELINES FOR LINKS:
- For YouTube videos: Use links that are likely to be maintained and available for the foreseeable future
- For webpages: Only use reputable educational websites, official documentation, or well-maintained educational resources
- Avoid using temporary or unstable links
- Prefer evergreen content that is likely to remain available
- For YouTube, use the full watch URL format (https://www.youtube.com/watch?v=...)
- For webpages, always use HTTPS URLs

Respond with a JSON array of activities, where each activity follows this schema:
{
  "type": "youtube" | "webpage" | "create-flashcards" | "writing-activity" | "dialogue-tutoring",
  "url"?: string,  // for youtube and webpage types - must be a complete, valid URL
  "scaffold"?: string,  // for create-flashcards and writing-activity types, use markdown syntax with headings, it should provide a scaffold for a text document that the student will then engage within
  "systemPrompt"?: string  // for dialogue-tutoring type, it should be a system prompt that instructs the LLM on how to behave for the tutoring activity, to meet the intended learning outcomes
}

Create 7 - 8 activities, with a dialogue tutoring activity in the middle.

Do not include any other text than the JSON array, not even backticks. 

Each activity should be specific and actionable.`;

		try {
			const completion = await openai.responses.create({
				// model: "gpt-4.1",
				// messages: [
				// 	{
				// 		role: "system",
				// 		content: "You are a pedagogical learning orchestrator that creates structured learning activities based on user goals and preferences."
				// 	},
				// 	{
				// 		role: "user",
				// 		content: prompt
				// 	}
				// ],
				input: prompt,
				temperature: 1,
				model: "gpt-4.1",
    			tools: [ { type: "web_search_preview" } ],
			});

			// const response = completion.choices[0]?.message?.content;
			const response = completion.output_text;
			if (!response) {
				throw new Error("No response from OpenAI");
			}

			// Parse the JSON response
			const activities = JSON.parse(response) as Activity[];
			return activities;
		} catch (error) {
			console.error("Error generating learning activities:", error);
			new Notice("Error generating learning activities. Please check the console for details.");
			return [];
		}
	}
}

class CanvasDailyNotePluginSettingTab extends PluginSettingTab {
	plugin: CanvasDailyNotePlugin;

	constructor(app: App, plugin: CanvasDailyNotePlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName("OpenAI API Key")
			.setDesc("Enter your OpenAI API key to enable AI-powered learning orchestration")
			.addText(text => text
				.setPlaceholder("sk-...")
				.setValue(this.plugin.settings.openaiApiKey)
				.onChange(async (value) => {
					this.plugin.settings.openaiApiKey = value;
					await this.plugin.saveSettings();
				}));

		containerEl.createEl("hr");

		new Setting(containerEl)
			.setName("Automatically create daily note")
			.setDesc(
				`Should the plugin attempt to create the daily note if it does not exist?`
			)
			.addToggle((component) => {
				component.setValue(this.plugin.settings.createIfNotExists);
				component.onChange((value) => {
					this.plugin.settings.createIfNotExists = value;
					this.plugin.saveSettings();
				});
			});

		containerEl.createEl("hr");

		containerEl.createEl("h1", { text: "Skip days" });
		containerEl.createEl("p", {
			attr: {
				style: "display: block; margin-bottom: 10px",
			},
			text: "If there are certain days of the week you wish to skip creating a new note for, you can configure that here. The plugin will not attempt to automatically create new notes on those days.",
		});

		DAYS.forEach((day) => {
			new Setting(containerEl)
				.setName(day)
				.setDesc(`Skip automatically creating notes on ${day}?`)
				.addToggle((component) => {
					// @ts-ignore
					component.setValue(this.plugin.settings[`skip${day}`]);
					component.onChange((value) => {
						// @ts-ignore
						this.plugin.settings[`skip${day}`] = value;
						this.plugin.saveSettings();
					});
				});
		});
	}
}