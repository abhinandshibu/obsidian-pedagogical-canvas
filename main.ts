import { NodeCreationParams, TextNode } from 'types/node.types';
import { App, Editor, MarkdownView, Modal, Notice, Plugin, PluginSettingTab, Setting, View } from 'obsidian';
import {
	AllCanvasNodeData,
	CanvasEdgeData,
	CanvasData,
	NodeSide,
} from "obsidian/canvas";



interface MyPluginSettings {
	mySetting: string;
}

const DEFAULT_SETTINGS: MyPluginSettings = {
	mySetting: 'default'
}

export default class MyPlugin extends Plugin {
	settings: MyPluginSettings;

	async onload() {
		await this.loadSettings();

		// This creates an icon in the left ribbon.
		const ribbonIconEl = this.addRibbonIcon('dice', 'Sample Plugin', (evt: MouseEvent) => {
			// Called when the user clicks the icon.
			new Notice('This is a notice!');
		});
		// Perform additional things with the ribbon
		ribbonIconEl.addClass('my-plugin-ribbon-class');

		// This adds a status bar item to the bottom of the app. Does not work on mobile apps.
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText('Status Bar Text');

		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'open-sample-modal-simple',
			name: 'Open sample modal (simple)',
			callback: () => {
				new SampleModal(this.app).open();
			}
		});
		// This adds an editor command that can perform some operation on the current editor instance
		this.addCommand({
			id: 'sample-editor-command',
			name: 'Sample editor command',
			editorCallback: (editor: Editor, view: MarkdownView) => {
				console.log(editor.getSelection());
				editor.replaceSelection('Sample Editor Command');
			}
		});
		// This adds a complex command that can check whether the current state of the app allows execution of the command
		this.addCommand({
			id: 'open-sample-modal-complex',
			name: 'Open sample modal (complex)',
			checkCallback: (checking: boolean) => {
				// Conditions to check
				const markdownView = this.app.workspace.getActiveViewOfType(MarkdownView);
				if (markdownView) {
					// If checking is true, we're simply "checking" if the command can be run.
					// If checking is false, then we want to actually perform the operation.
					if (!checking) {
						new SampleModal(this.app).open();
					}

					// This command will only show up in Command Palette when the check function returns true
					return true;
				}
			},
		});

		// TODODODODO Add a command to create a canvas node
		this.addCommand({
			id: 'create-canvas-node',
			name: 'Create Canvas Node',
			callback: () => {
				const view = this.app.workspace.activeLeaf?.view;
				if (view && 'canvas' in view) {
					const canvas = view.canvas as any;
					
					// Inspect the addNode function
					console.log('addNode function:', canvas.addNode);
					console.log('addNode function definition:', canvas.addNode.toString());
					
					// Create a text node
					const textNode: any = {
						type: 'text',
						text: 'New Text Node',
						x: 0,
						y: 0,
						width: 200,
						height: 100,
						id: 'text-node-2',
						unknownData: {
							id: 'text-node-2',
							type: 'text',
							text: 'New Text Node',
						}
					};
					
					// // Create a file node
					// const fileNode: NodeCreationParams = {
					// 	type: 'file',
					// 	file: 'path/to/file.md',
					// 	x: 250,
					// 	y: 0,
					// 	width: 200,
					// 	height: 100
					// };
					
					// // Create a link node
					// const linkNode: NodeCreationParams = {
					// 	type: 'link',
					// 	url: 'https://example.com',
					// 	x: 500,
					// 	y: 0,
					// 	width: 200,
					// 	height: 100
					// };
					
					// // Create a group node
					// const groupNode: NodeCreationParams = {
					// 	type: 'group',
					// 	label: 'My Group',
					// 	x: 750,
					// 	y: 0,
					// 	width: 200,
					// 	height: 100,
					// 	backgroundStyle: 'cover'
					// };
					
					console.log(canvas.nodes);
					// Add nodes to canvas
					canvas.addNode(textNode);
					// canvas.addNode(fileNode);
					// canvas.addNode(linkNode);
					// canvas.addNode(groupNode);
					console.log(canvas.nodes);
				}
			}
		});

		// This adds a settings tab so the user can configure various aspects of the plugin
		this.addSettingTab(new SampleSettingTab(this.app, this));

		// If the plugin hooks up any global DOM events (on parts of the app that doesn't belong to this plugin)
		// Using this function will automatically remove the event listener when this plugin is disabled.
		this.registerDomEvent(document, 'click', (evt: MouseEvent) => {
			console.log('click', evt);
		});

		// When registering intervals, this function will automatically clear the interval when the plugin is disabled.
		this.registerInterval(window.setInterval(() => console.log('setInterval'), 5 * 60 * 1000));
	}

	onunload() {

	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

class SampleModal extends Modal {
	constructor(app: App) {
		super(app);
	}

	onOpen() {
		const {contentEl} = this;
		contentEl.setText('Woah!');
	}

	onClose() {
		const {contentEl} = this;
		contentEl.empty();
	}
}

class SampleSettingTab extends PluginSettingTab {
	plugin: MyPlugin;

	constructor(app: App, plugin: MyPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const {containerEl} = this;

		containerEl.empty();

		new Setting(containerEl)
			.setName('Setting #1')
			.setDesc('It\'s a secret')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.settings.mySetting)
				.onChange(async (value) => {
					this.plugin.settings.mySetting = value;
					await this.plugin.saveSettings();
				}));
	}
}
