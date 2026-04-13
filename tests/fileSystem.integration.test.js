import test from "node:test";
import assert from "node:assert/strict";

function createLocalStorageStore(map = new Map()) {
  return {
    getItem: key => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      map.set(key, String(value));
    },
    removeItem: key => {
      map.delete(key);
    }
  };
}

async function loadFileSystemModule() {
  return import(`../fileSystem.js?test=${Date.now()}_${Math.random()}`);
}

function createFileHandle(text) {
  return {
    kind: "file",
    async getFile() {
      return {
        async text() {
          return text;
        }
      };
    }
  };
}

function createDirectoryHandle(name, entries = [], options = {}) {
  const removed = options.removed ?? [];
  const writes = options.writes ?? [];

  return {
    name,
    kind: "directory",
    async getDirectoryHandle(childName) {
      return options.childDirs?.[childName] ?? createDirectoryHandle(childName);
    },
    async getFileHandle(fileName) {
      return {
        async getFile() {
          const found = entries.find(([entryName]) => entryName === fileName);
          if (!found) throw new Error("not found");
          const [, handle] = found;
          return handle.getFile();
        },
        async createWritable() {
          return {
            async write(text) {
              writes.push({ fileName, text: String(text) });
            },
            async close() {}
          };
        }
      };
    },
    async removeEntry(fileName) {
      removed.push(fileName);
    },
    async *entries() {
      for (const entry of entries) {
        yield entry;
      }
    }
  };
}

function setBrowserEnv({ protocol = "https:", showDirectoryPicker = null, localStorage = null, document = null, URLImpl = null, BlobImpl = null, setTimeoutImpl = null } = {}) {
  const prev = {
    location: globalThis.location,
    window: globalThis.window,
    localStorage: globalThis.localStorage,
    document: globalThis.document,
    URL: globalThis.URL,
    Blob: globalThis.Blob,
    setTimeout: globalThis.setTimeout
  };

  globalThis.location = { protocol };
  globalThis.window = { showDirectoryPicker };
  if (localStorage) globalThis.localStorage = localStorage;
  if (document) globalThis.document = document;
  if (URLImpl) globalThis.URL = URLImpl;
  if (BlobImpl) globalThis.Blob = BlobImpl;
  if (setTimeoutImpl) globalThis.setTimeout = setTimeoutImpl;

  return () => {
    globalThis.location = prev.location;
    globalThis.window = prev.window;
    globalThis.localStorage = prev.localStorage;
    globalThis.document = prev.document;
    globalThis.URL = prev.URL;
    globalThis.Blob = prev.Blob;
    globalThis.setTimeout = prev.setTimeout;
  };
}

test("fileSystem support detection returns false on file protocol", async () => {
  const restore = setBrowserEnv({
    protocol: "file:",
    showDirectoryPicker: async () => ({})
  });

  try {
    const fs = await loadFileSystemModule();
    assert.equal(fs.isFileSystemSupported(), false);
  } finally {
    restore();
  }
});

test("initFileSystem returns cancelled on AbortError", async () => {
  const store = new Map();
  const restore = setBrowserEnv({
    protocol: "https:",
    showDirectoryPicker: async () => {
      const err = new Error("aborted");
      err.name = "AbortError";
      throw err;
    },
    localStorage: createLocalStorageStore(store)
  });

  try {
    const fs = await loadFileSystemModule();
    const result = await fs.initFileSystem();
    assert.deepEqual(result, { ok: false, reason: "cancelled" });
  } finally {
    restore();
  }
});

test("initFileSystem success enables file access and stores folder name", async () => {
  const store = new Map();

  const charsDir = createDirectoryHandle("characters");
  const factionsDir = createDirectoryHandle("factions");
  const root = createDirectoryHandle("workspace", [], {
    childDirs: {
      characters: charsDir,
      factions: factionsDir
    }
  });

  const restore = setBrowserEnv({
    protocol: "https:",
    showDirectoryPicker: async () => root,
    localStorage: createLocalStorageStore(store)
  });

  try {
    const fs = await loadFileSystemModule();
    const result = await fs.initFileSystem();

    assert.deepEqual(result, { ok: true });
    assert.equal(fs.hasFileAccess(), true);
    assert.equal(fs.getFolderName(), "workspace");
    assert.equal(store.get("custom_npcs_folder_name"), "workspace");
  } finally {
    restore();
  }
});

test("loadCharactersFromFolder reads valid json files and skips invalid ones", async () => {
  const store = new Map();
  const charsEntries = [
    ["a.json", createFileHandle(JSON.stringify({ id: "a", name: "A" }))],
    ["bad.json", createFileHandle("{not json")],
    ["notes.txt", createFileHandle("ignored")]
  ];

  const charsDir = createDirectoryHandle("characters", charsEntries);
  const factionsDir = createDirectoryHandle("factions", []);
  const root = createDirectoryHandle("workspace", [], {
    childDirs: {
      characters: charsDir,
      factions: factionsDir
    }
  });

  const restore = setBrowserEnv({
    protocol: "https:",
    showDirectoryPicker: async () => root,
    localStorage: createLocalStorageStore(store)
  });

  try {
    const fs = await loadFileSystemModule();
    await fs.initFileSystem();
    const npcs = await fs.loadCharactersFromFolder();

    assert.equal(npcs.length, 1);
    assert.equal(npcs[0].id, "a");
  } finally {
    restore();
  }
});

test("persistFactions writes current factions and removes stale files", async () => {
  const store = new Map();
  const writes = [];
  const removed = [];

  const charsDir = createDirectoryHandle("characters", []);
  const factionsEntries = [
    ["old.json", { kind: "file" }],
    ["keep.json", { kind: "file" }]
  ];
  const factionsDir = createDirectoryHandle("factions", factionsEntries, { writes, removed });
  const root = createDirectoryHandle("workspace", [], {
    childDirs: {
      characters: charsDir,
      factions: factionsDir
    }
  });

  const restore = setBrowserEnv({
    protocol: "https:",
    showDirectoryPicker: async () => root,
    localStorage: createLocalStorageStore(store)
  });

  try {
    const fs = await loadFileSystemModule();
    await fs.initFileSystem();

    await fs.persistFactions([{ id: "keep", name: "Keep" }, { id: "new", name: "New" }]);

    const writtenNames = writes.map(w => w.fileName).sort();
    assert.deepEqual(writtenNames, ["keep.json", "new.json"]);
    assert.ok(removed.includes("old.json"));
    assert.ok(!removed.includes("keep.json"));

    const stored = JSON.parse(store.get("custom_factions"));
    assert.equal(stored.length, 2);
  } finally {
    restore();
  }
});

test("persistNPCSnapshot stores snapshot in localStorage even without file access", async () => {
  const store = new Map();
  const restore = setBrowserEnv({
    protocol: "https:",
    showDirectoryPicker: null,
    localStorage: createLocalStorageStore(store)
  });

  try {
    const fs = await loadFileSystemModule();
    await fs.persistNPCSnapshot([{ id: "n1" }, { id: "n2" }]);

    const raw = store.get("npc_state_snapshot");
    const parsed = JSON.parse(raw);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].id, "n1");
  } finally {
    restore();
  }
});

test("exportNpcAndFactionFiles creates two download links", async () => {
  const links = [];
  const revoked = [];
  const timeouts = [];

  class FakeBlob {
    constructor(parts, opts) {
      this.parts = parts;
      this.type = opts?.type;
    }
  }

  const fakeDocument = {
    body: {
      appendChild(node) {
        links.push(node);
      }
    },
    createElement(tag) {
      assert.equal(tag, "a");
      return {
        clickCalled: false,
        removed: false,
        click() {
          this.clickCalled = true;
        },
        remove() {
          this.removed = true;
        }
      };
    }
  };

  const restore = setBrowserEnv({
    protocol: "https:",
    showDirectoryPicker: null,
    localStorage: createLocalStorageStore(new Map()),
    document: fakeDocument,
    BlobImpl: FakeBlob,
    URLImpl: {
      createObjectURL() {
        return `blob:${links.length + 1}`;
      },
      revokeObjectURL(url) {
        revoked.push(url);
      }
    },
    setTimeoutImpl(fn, delay) {
      timeouts.push(delay);
      fn();
      return 1;
    }
  });

  try {
    const fs = await loadFileSystemModule();
    fs.exportNpcAndFactionFiles({
      npcs: [{ id: "n1" }],
      factions: [{ id: "f1" }]
    });

    assert.equal(links.length, 2);
    assert.ok(String(links[0].download).startsWith("npc_export_"));
    assert.ok(String(links[1].download).startsWith("faction_export_"));
    assert.equal(links[0].clickCalled, true);
    assert.equal(links[1].clickCalled, true);
    assert.ok(timeouts.includes(150));
    assert.ok(timeouts.includes(2000));
    assert.equal(revoked.length, 2);
  } finally {
    restore();
  }
});

test("localStorage fallback loaders handle malformed payload safely", async () => {
  const store = new Map();
  store.set("custom_npcs", "not json");
  store.set("custom_factions", JSON.stringify({ nope: true }));

  const restore = setBrowserEnv({
    protocol: "https:",
    showDirectoryPicker: null,
    localStorage: createLocalStorageStore(store)
  });

  try {
    const fs = await loadFileSystemModule();
    assert.deepEqual(fs.loadFromLocalStorage(), []);
    assert.deepEqual(fs.loadFactionsFromLocalStorage(), []);

    fs.saveToLocalStorage([{ id: "x" }]);
    fs.saveFactionsToLocalStorage([{ id: "y" }]);

    assert.equal(JSON.parse(store.get("custom_npcs")).length, 1);
    assert.equal(JSON.parse(store.get("custom_factions")).length, 1);
  } finally {
    restore();
  }
});

test("persistFactions continues after individual file write failure", async () => {
  const store = new Map();
  const writes = [];

  const factionsDir = {
    kind: "directory",
    async getFileHandle(fileName) {
      if (fileName === "bad.json") {
        throw new Error("cannot open bad.json");
      }
      return {
        async createWritable() {
          return {
            async write(text) {
              writes.push({ fileName, text: String(text) });
            },
            async close() {}
          };
        }
      };
    },
    async removeEntry() {},
    async *entries() {}
  };

  const charsDir = createDirectoryHandle("characters");
  const root = createDirectoryHandle("workspace", [], {
    childDirs: {
      characters: charsDir,
      factions: factionsDir
    }
  });

  const restore = setBrowserEnv({
    protocol: "https:",
    showDirectoryPicker: async () => root,
    localStorage: createLocalStorageStore(store)
  });

  try {
    const fs = await loadFileSystemModule();
    await fs.initFileSystem();
    await fs.persistFactions([{ id: "bad", name: "Bad" }, { id: "good", name: "Good" }]);

    assert.equal(writes.length, 1);
    assert.equal(writes[0].fileName, "good.json");

    const saved = JSON.parse(store.get("custom_factions"));
    assert.equal(saved.length, 2);
  } finally {
    restore();
  }
});

test("queued persist and remove operations keep deterministic order", async () => {
  const store = new Map();
  const log = [];

  const charsDir = {
    kind: "directory",
    async getFileHandle(fileName) {
      return {
        async createWritable() {
          return {
            async write() {
              log.push(`write:${fileName}`);
            },
            async close() {}
          };
        }
      };
    },
    async removeEntry(fileName) {
      log.push(`remove:${fileName}`);
    },
    async *entries() {}
  };

  const factionsDir = createDirectoryHandle("factions");
  const root = createDirectoryHandle("workspace", [], {
    childDirs: {
      characters: charsDir,
      factions: factionsDir
    }
  });

  const restore = setBrowserEnv({
    protocol: "https:",
    showDirectoryPicker: async () => root,
    localStorage: createLocalStorageStore(store)
  });

  try {
    const fs = await loadFileSystemModule();
    await fs.initFileSystem();

    const p1 = fs.persistNPC({ id: "npc_1" }, [{ id: "npc_1" }]);
    const p2 = fs.removePersistedNPC("npc_1", []);
    await Promise.all([p1, p2]);

    assert.deepEqual(log, ["write:npc_1.json", "remove:npc_1.json"]);
    const saved = JSON.parse(store.get("custom_npcs"));
    assert.deepEqual(saved, []);
  } finally {
    restore();
  }
});

test("export payload includes expected schema fields", async () => {
  const blobs = [];

  class FakeBlob {
    constructor(parts, opts) {
      this.parts = parts;
      this.type = opts?.type;
    }
  }

  const fakeDocument = {
    body: {
      appendChild() {}
    },
    createElement() {
      return {
        click() {},
        remove() {}
      };
    }
  };

  const restore = setBrowserEnv({
    protocol: "https:",
    showDirectoryPicker: null,
    localStorage: createLocalStorageStore(new Map()),
    document: fakeDocument,
    BlobImpl: FakeBlob,
    URLImpl: {
      createObjectURL(blob) {
        blobs.push(blob);
        return `blob:${blobs.length}`;
      },
      revokeObjectURL() {}
    },
    setTimeoutImpl(fn) {
      fn();
      return 1;
    }
  });

  try {
    const fs = await loadFileSystemModule();
    fs.exportNpcAndFactionFiles({
      npcs: [{ id: "n1", name: "N" }],
      factions: [{ id: "f1", name: "F" }]
    });

    assert.equal(blobs.length, 2);
    const npcPayload = JSON.parse(String(blobs[0].parts[0]));
    const factionPayload = JSON.parse(String(blobs[1].parts[0]));

    assert.equal(npcPayload.format, "npc_collection_v1");
    assert.equal(Array.isArray(npcPayload.npcs), true);
    assert.equal(typeof npcPayload.exportedAt, "string");

    assert.equal(factionPayload.format, "faction_collection_v1");
    assert.equal(Array.isArray(factionPayload.factions), true);
    assert.equal(typeof factionPayload.exportedAt, "string");
  } finally {
    restore();
  }
});
