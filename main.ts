import {
	App,
	ItemView,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TextAreaComponent,
	TextComponent,
	WorkspaceLeaf,
} from "obsidian";
import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Skill {
	name: string;
	path: string;
	description: string;
	argumentHint: string;
	content: string;
	body: string;
	tags: string[];
}

interface SkillMeta {
	skills: Record<string, { tags?: string[] }>;
	remote: string;
}

interface PluginSettings {
	commandsDir: string;
	metaFile: string;
	remote: string;
}

const DEFAULT_SETTINGS: PluginSettings = {
	commandsDir: path.join(
		process.env.HOME || "~",
		".claude",
		"commands"
	),
	metaFile: path.join(process.env.HOME || "~", ".claude", "skill_meta.json"),
	remote: "",
};

const VIEW_TYPE = "skill-manager-view";

// ─── Skill IO ────────────────────────────────────────────────────────────────

function parseFrontmatter(content: string): { fields: Record<string, string>; body: string } {
	if (!content.startsWith("---")) return { fields: {}, body: content };
	const parts = content.split("---", 3);
	if (parts.length < 3) return { fields: {}, body: content };
	const fields: Record<string, string> = {};
	for (const line of parts[1].trim().split("\n")) {
		const idx = line.indexOf(":");
		if (idx > 0) {
			fields[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
		}
	}
	return { fields, body: parts[2].trim() };
}

function buildContent(skill: Skill): string {
	const lines = ["---"];
	if (skill.description) lines.push(`description: ${skill.description}`);
	if (skill.argumentHint) lines.push(`argument-hint: ${skill.argumentHint}`);
	lines.push("---", "", skill.body);
	return lines.join("\n");
}

function loadMeta(metaFile: string): SkillMeta {
	try {
		if (fs.existsSync(metaFile)) {
			return JSON.parse(fs.readFileSync(metaFile, "utf-8"));
		}
	} catch { /* ignore */ }
	return { skills: {}, remote: "" };
}

function saveMeta(metaFile: string, meta: SkillMeta) {
	fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2), "utf-8");
}

function loadAllSkills(settings: PluginSettings): Skill[] {
	const dir = settings.commandsDir;
	if (!fs.existsSync(dir)) return [];
	const meta = loadMeta(settings.metaFile);
	const skills: Skill[] = [];
	for (const file of fs.readdirSync(dir).sort()) {
		if (!file.endsWith(".md")) continue;
		const fullPath = path.join(dir, file);
		const content = fs.readFileSync(fullPath, "utf-8");
		const { fields, body } = parseFrontmatter(content);
		const name = file.replace(/\.md$/, "");
		skills.push({
			name,
			path: fullPath,
			description: fields["description"] || "",
			argumentHint: fields["argument-hint"] || "",
			content,
			body,
			tags: meta.skills[name]?.tags || [],
		});
	}
	return skills;
}

// ─── Skill List View ─────────────────────────────────────────────────────────

class SkillManagerView extends ItemView {
	plugin: SkillManagerPlugin;
	skills: Skill[] = [];
	filteredSkills: Skill[] = [];
	selectedSkill: Skill | null = null;
	searchQuery = "";

	constructor(leaf: WorkspaceLeaf, plugin: SkillManagerPlugin) {
		super(leaf);
		this.plugin = plugin;
	}

	getViewType(): string { return VIEW_TYPE; }
	getDisplayText(): string { return "Skill Manager"; }
	getIcon(): string { return "terminal"; }

	async onOpen() {
		this.reload();
	}

	reload() {
		this.skills = loadAllSkills(this.plugin.settings);
		this.applyFilter();
	}

	applyFilter() {
		const q = this.searchQuery.toLowerCase();
		this.filteredSkills = q
			? this.skills.filter(
				(s) =>
					s.name.toLowerCase().includes(q) ||
					s.description.toLowerCase().includes(q) ||
					s.tags.some((t) => t.toLowerCase().includes(q))
			)
			: [...this.skills];
		this.render();
	}

	render() {
		const container = this.contentEl;
		container.empty();
		container.addClass("skill-manager-container");

		// ─── Header ─────────────────────────────────────────────
		const header = container.createDiv("skill-manager-header");
		header.createEl("h4", { text: `Skills (${this.filteredSkills.length}/${this.skills.length})` });

		const toolbar = header.createDiv("skill-manager-toolbar");
		const addBtn = toolbar.createEl("button", { text: "+ New" });
		addBtn.addEventListener("click", () => new NewSkillModal(this.app, this.plugin, this).open());
		const syncBtn = toolbar.createEl("button", { text: "Sync" });
		syncBtn.addEventListener("click", () => new SyncModal(this.app, this.plugin).open());

		// ─── Search ─────────────────────────────────────────────
		const searchInput = container.createEl("input", {
			type: "text",
			placeholder: "Search skills...",
			cls: "skill-manager-search",
		});
		searchInput.value = this.searchQuery;
		searchInput.addEventListener("input", () => {
			this.searchQuery = searchInput.value;
			this.applyFilter();
		});

		// ─── Two-Panel Layout ───────────────────────────────────
		const panels = container.createDiv("skill-manager-panels");
		const listPanel = panels.createDiv("skill-manager-list");
		const detailPanel = panels.createDiv("skill-manager-detail");

		// ─── Skill List ─────────────────────────────────────────
		for (const skill of this.filteredSkills) {
			const item = listPanel.createDiv({
				cls: `skill-item${this.selectedSkill?.name === skill.name ? " selected" : ""}`,
			});
			item.createDiv({ text: `/${skill.name}`, cls: "skill-item-name" });
			if (skill.tags.length > 0) {
				const tagsEl = item.createDiv({ cls: "skill-item-tags" });
				for (const tag of skill.tags.slice(0, 3)) {
					tagsEl.createEl("span", { text: `#${tag}`, cls: "skill-tag" });
				}
			}
			item.addEventListener("click", () => {
				this.selectedSkill = skill;
				this.render();
			});
		}

		// ─── Detail Panel ───────────────────────────────────────
		if (this.selectedSkill) {
			const s = this.selectedSkill;
			detailPanel.createEl("h3", { text: `/${s.name}` });
			if (s.description) {
				detailPanel.createEl("p", { text: s.description, cls: "skill-detail-desc" });
			}
			if (s.argumentHint) {
				detailPanel.createEl("p", { text: `→ ${s.argumentHint}`, cls: "skill-detail-args" });
			}
			if (s.tags.length > 0) {
				const tagsEl = detailPanel.createDiv({ cls: "skill-detail-tags" });
				for (const tag of s.tags) {
					tagsEl.createEl("span", { text: `#${tag}`, cls: "skill-tag" });
				}
			}

			// Action buttons
			const actions = detailPanel.createDiv("skill-detail-actions");
			const editBtn = actions.createEl("button", { text: "Edit" });
			editBtn.addEventListener("click", () => new EditSkillModal(this.app, this.plugin, this, s).open());
			const tagBtn = actions.createEl("button", { text: "Tags" });
			tagBtn.addEventListener("click", () => new TagModal(this.app, this.plugin, this, s).open());
			const delBtn = actions.createEl("button", { text: "Delete", cls: "mod-warning" });
			delBtn.addEventListener("click", () => new DeleteModal(this.app, this.plugin, this, s).open());

			// Content preview
			const preview = detailPanel.createDiv("skill-detail-preview");
			const previewLines = s.body.split("\n").slice(0, 40);
			preview.createEl("pre", { text: previewLines.join("\n") });
		} else {
			detailPanel.createEl("p", {
				text: "Select a skill to view details",
				cls: "skill-detail-empty",
			});
		}
	}

	async onClose() { /* cleanup */ }
}

// ─── Modals ──────────────────────────────────────────────────────────────────

class NewSkillModal extends Modal {
	plugin: SkillManagerPlugin;
	view: SkillManagerView;
	nameVal = "";
	descVal = "";
	argsVal = "";
	bodyVal = "";

	constructor(app: App, plugin: SkillManagerPlugin, view: SkillManagerView) {
		super(app);
		this.plugin = plugin;
		this.view = view;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: "New Skill" });

		new Setting(contentEl).setName("Command name").addText((text) => {
			text.setPlaceholder("e.g. blog-post");
			text.onChange((v) => (this.nameVal = v));
		});
		new Setting(contentEl).setName("Description").addText((text) => {
			text.setPlaceholder("One-line description");
			text.onChange((v) => (this.descVal = v));
		});
		new Setting(contentEl).setName("Argument hint").addText((text) => {
			text.setPlaceholder("[topic] [tone]");
			text.onChange((v) => (this.argsVal = v));
		});
		contentEl.createEl("label", { text: "Content body:" });
		const ta = contentEl.createEl("textarea", { cls: "skill-modal-textarea" });
		ta.addEventListener("input", () => (this.bodyVal = ta.value));

		new Setting(contentEl)
			.addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((btn) =>
				btn
					.setButtonText("Create")
					.setCta()
					.onClick(() => this.create())
			);
	}

	create() {
		if (!this.nameVal.trim()) {
			new Notice("Please enter a command name");
			return;
		}
		const s = this.plugin.settings;
		const filePath = path.join(s.commandsDir, `${this.nameVal.trim()}.md`);
		const skill: Skill = {
			name: this.nameVal.trim(),
			path: filePath,
			description: this.descVal.trim(),
			argumentHint: this.argsVal.trim(),
			content: "",
			body: this.bodyVal,
			tags: [],
		};
		fs.writeFileSync(filePath, buildContent(skill), "utf-8");
		new Notice(`Created /${skill.name}`);
		this.view.reload();
		this.close();
	}

	onClose() { this.contentEl.empty(); }
}

class EditSkillModal extends Modal {
	plugin: SkillManagerPlugin;
	view: SkillManagerView;
	skill: Skill;

	constructor(app: App, plugin: SkillManagerPlugin, view: SkillManagerView, skill: Skill) {
		super(app);
		this.plugin = plugin;
		this.view = view;
		this.skill = { ...skill };
	}

	onOpen() {
		const { contentEl } = this;
		const s = this.skill;
		contentEl.createEl("h3", { text: `Edit /${s.name}` });

		new Setting(contentEl).setName("Description").addText((text) => {
			text.setValue(s.description);
			text.onChange((v) => (s.description = v));
		});
		new Setting(contentEl).setName("Argument hint").addText((text) => {
			text.setValue(s.argumentHint);
			text.onChange((v) => (s.argumentHint = v));
		});
		contentEl.createEl("label", { text: "Content body:" });
		const ta = contentEl.createEl("textarea", { cls: "skill-modal-textarea" });
		ta.value = s.body;
		ta.addEventListener("input", () => (s.body = ta.value));

		new Setting(contentEl)
			.addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((btn) =>
				btn
					.setButtonText("Save")
					.setCta()
					.onClick(() => this.save())
			);
	}

	save() {
		fs.writeFileSync(this.skill.path, buildContent(this.skill), "utf-8");
		new Notice(`Saved /${this.skill.name}`);
		this.view.reload();
		this.close();
	}

	onClose() { this.contentEl.empty(); }
}

class TagModal extends Modal {
	plugin: SkillManagerPlugin;
	view: SkillManagerView;
	skill: Skill;
	tagInput = "";

	constructor(app: App, plugin: SkillManagerPlugin, view: SkillManagerView, skill: Skill) {
		super(app);
		this.plugin = plugin;
		this.view = view;
		this.skill = skill;
		this.tagInput = skill.tags.join(", ");
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: `Tags for /${this.skill.name}` });

		new Setting(contentEl)
			.setName("Tags (comma separated)")
			.addText((text) => {
				text.setValue(this.tagInput);
				text.setPlaceholder("ESG, 永續, 新聞稿");
				text.onChange((v) => (this.tagInput = v));
			});

		new Setting(contentEl)
			.addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((btn) =>
				btn
					.setButtonText("Save")
					.setCta()
					.onClick(() => this.saveTags())
			);
	}

	saveTags() {
		const tags = this.tagInput
			.split(",")
			.map((t) => t.trim())
			.filter((t) => t.length > 0);
		const meta = loadMeta(this.plugin.settings.metaFile);
		if (!meta.skills[this.skill.name]) meta.skills[this.skill.name] = {};
		meta.skills[this.skill.name].tags = tags;
		saveMeta(this.plugin.settings.metaFile, meta);
		new Notice(`Updated tags for /${this.skill.name}`);
		this.view.reload();
		this.close();
	}

	onClose() { this.contentEl.empty(); }
}

class DeleteModal extends Modal {
	plugin: SkillManagerPlugin;
	view: SkillManagerView;
	skill: Skill;

	constructor(app: App, plugin: SkillManagerPlugin, view: SkillManagerView, skill: Skill) {
		super(app);
		this.plugin = plugin;
		this.view = view;
		this.skill = skill;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.createEl("h3", { text: "Delete Skill" });
		contentEl.createEl("p", {
			text: `Are you sure you want to delete /${this.skill.name}? This cannot be undone.`,
		});
		new Setting(contentEl)
			.addButton((btn) => btn.setButtonText("Cancel").onClick(() => this.close()))
			.addButton((btn) =>
				btn
					.setButtonText("Delete")
					.setWarning()
					.onClick(() => this.doDelete())
			);
	}

	doDelete() {
		try {
			fs.unlinkSync(this.skill.path);
			const meta = loadMeta(this.plugin.settings.metaFile);
			delete meta.skills[this.skill.name];
			saveMeta(this.plugin.settings.metaFile, meta);
			new Notice(`Deleted /${this.skill.name}`);
		} catch (e) {
			new Notice(`Error: ${e}`);
		}
		this.view.selectedSkill = null;
		this.view.reload();
		this.close();
	}

	onClose() { this.contentEl.empty(); }
}

class SyncModal extends Modal {
	plugin: SkillManagerPlugin;

	constructor(app: App, plugin: SkillManagerPlugin) {
		super(app);
		this.plugin = plugin;
	}

	onOpen() {
		const { contentEl } = this;
		const s = this.plugin.settings;
		contentEl.createEl("h3", { text: "Git Sync" });

		const logEl = contentEl.createDiv("skill-sync-log");

		new Setting(contentEl).setName("Remote URL").addText((text) => {
			text.setValue(s.remote);
			text.setPlaceholder("git@github.com:user/repo.git");
			text.onChange((v) => {
				s.remote = v;
				this.plugin.saveSettings();
				// Also update meta
				const meta = loadMeta(s.metaFile);
				meta.remote = v;
				saveMeta(s.metaFile, meta);
			});
		});

		new Setting(contentEl)
			.addButton((btn) =>
				btn.setButtonText("Pull").onClick(() => {
					this.gitCmd("pull", logEl);
				})
			)
			.addButton((btn) =>
				btn
					.setButtonText("Push")
					.setCta()
					.onClick(() => {
						this.gitCmd("push", logEl);
					})
			)
			.addButton((btn) => btn.setButtonText("Close").onClick(() => this.close()));
	}

	gitCmd(action: "push" | "pull", logEl: HTMLElement) {
		const dir = this.plugin.settings.commandsDir;
		const remote = this.plugin.settings.remote;
		const log = (msg: string) => {
			logEl.createEl("div", { text: msg });
			logEl.scrollTop = logEl.scrollHeight;
		};

		try {
			// Ensure git init
			if (!fs.existsSync(path.join(dir, ".git"))) {
				execSync("git init && git checkout -b main", { cwd: dir });
				fs.writeFileSync(path.join(dir, ".gitignore"), ".DS_Store\n*.swp\n");
				log("Initialized git repo");
			}
			// Set remote
			if (remote) {
				try {
					execSync("git remote get-url origin", { cwd: dir });
					execSync(`git remote set-url origin ${remote}`, { cwd: dir });
				} catch {
					execSync(`git remote add origin ${remote}`, { cwd: dir });
				}
			}

			if (action === "push") {
				execSync("git add .", { cwd: dir });
				// Add meta file
				const metaFile = this.plugin.settings.metaFile;
				if (fs.existsSync(metaFile)) {
					execSync(`git add "${metaFile}"`, { cwd: dir });
				}
				try {
					execSync("git diff --cached --quiet", { cwd: dir });
					log("Nothing to push (no changes)");
					return;
				} catch { /* has changes */ }
				execSync('git commit -m "Update skills via Obsidian plugin"', { cwd: dir });
				const result = execSync("git push -u origin main 2>&1", { cwd: dir }).toString();
				log("Pushed: " + result.trim());
				new Notice("Skills pushed successfully");
			} else {
				const result = execSync("git pull --rebase origin main 2>&1", { cwd: dir }).toString();
				log("Pulled: " + result.trim());
				new Notice("Skills pulled successfully");
			}
		} catch (e: any) {
			log("Error: " + (e.stderr?.toString() || e.message));
			new Notice("Git error — check sync log");
		}
	}

	onClose() { this.contentEl.empty(); }
}

// ─── Settings Tab ────────────────────────────────────────────────────────────

class SkillManagerSettingTab extends PluginSettingTab {
	plugin: SkillManagerPlugin;

	constructor(app: App, plugin: SkillManagerPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display() {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Claude Skill Manager" });

		new Setting(containerEl)
			.setName("Commands directory")
			.setDesc("Path to ~/.claude/commands/")
			.addText((text) =>
				text
					.setValue(this.plugin.settings.commandsDir)
					.onChange(async (v) => {
						this.plugin.settings.commandsDir = v;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Git remote URL")
			.setDesc("For syncing skills across machines")
			.addText((text) =>
				text
					.setPlaceholder("git@github.com:user/repo.git")
					.setValue(this.plugin.settings.remote)
					.onChange(async (v) => {
						this.plugin.settings.remote = v;
						await this.plugin.saveSettings();
					})
			);

		const statsEl = containerEl.createDiv("skill-manager-stats");
		const skills = loadAllSkills(this.plugin.settings);
		statsEl.createEl("p", {
			text: `Currently managing ${skills.length} skills in ${this.plugin.settings.commandsDir}`,
		});
	}
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export default class SkillManagerPlugin extends Plugin {
	settings: PluginSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		// Register the custom view
		this.registerView(VIEW_TYPE, (leaf) => new SkillManagerView(leaf, this));

		// Ribbon icon
		this.addRibbonIcon("terminal", "Open Skill Manager", () => {
			this.activateView();
		});

		// Commands
		this.addCommand({
			id: "open-skill-manager",
			name: "Open Skill Manager",
			callback: () => this.activateView(),
		});

		this.addCommand({
			id: "reload-skills",
			name: "Reload Skills",
			callback: () => {
				const view = this.getView();
				if (view) {
					view.reload();
					new Notice("Skills reloaded");
				}
			},
		});

		this.addCommand({
			id: "sync-push",
			name: "Push Skills to Remote",
			callback: () => {
				new SyncModal(this.app, this).open();
			},
		});

		// Settings tab
		this.addSettingTab(new SkillManagerSettingTab(this.app, this));
	}

	async activateView() {
		const { workspace } = this.app;
		let leaf = workspace.getLeavesOfType(VIEW_TYPE)[0];
		if (!leaf) {
			const rightLeaf = workspace.getRightLeaf(false);
			if (rightLeaf) {
				leaf = rightLeaf;
				await leaf.setViewState({ type: VIEW_TYPE, active: true });
			}
		}
		if (leaf) workspace.revealLeaf(leaf);
	}

	getView(): SkillManagerView | null {
		const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE);
		return leaves.length > 0 ? (leaves[0].view as SkillManagerView) : null;
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
		// Also load remote from meta if available
		const meta = loadMeta(this.settings.metaFile);
		if (meta.remote && !this.settings.remote) {
			this.settings.remote = meta.remote;
		}
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}
