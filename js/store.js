/*
 * 本地存储 —— 草稿存在 localStorage，图片和字体这类大文件存在 IndexedDB
 * 所有读写都包了 try/catch：无痕模式或存储被禁用时，工具照样能用，只是不保存。
 */
const Store = (() => {
    const PREFIX = 'xhs-studio:';

    const local = {
        get(key, fallback = null) {
            try {
                const raw = localStorage.getItem(PREFIX + key);
                return raw == null ? fallback : JSON.parse(raw);
            } catch {
                return fallback;
            }
        },
        set(key, value) {
            try {
                localStorage.setItem(PREFIX + key, JSON.stringify(value));
                return true;
            } catch {
                return false;
            }
        },
        remove(key) {
            try { localStorage.removeItem(PREFIX + key); } catch { /* 忽略 */ }
        },
    };

    /* ---------------- IndexedDB：一个极简的键值存储 ---------------- */
    let dbPromise = null;
    function db() {
        if (!dbPromise) {
            dbPromise = new Promise((resolve, reject) => {
                if (!('indexedDB' in self)) return reject(new Error('no indexedDB'));
                const req = indexedDB.open('xhs-studio', 1);
                req.onupgradeneeded = () => req.result.createObjectStore('assets');
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            }).catch((e) => {
                console.warn('IndexedDB 不可用，图片不会被保存', e);
                return null;
            });
        }
        return dbPromise;
    }

    async function idb(mode, fn) {
        const d = await db();
        if (!d) return undefined;
        return new Promise((resolve) => {
            const tx = d.transaction('assets', mode);
            const req = fn(tx.objectStore('assets'));
            tx.oncomplete = () => resolve(req && req.result);
            tx.onerror = () => resolve(undefined);
        });
    }

    const assets = {
        get: (key) => idb('readonly', (s) => s.get(key)),
        put: (key, value) => idb('readwrite', (s) => s.put(value, key)),
        remove: (key) => idb('readwrite', (s) => s.delete(key)),
    };

    /* ---------------- 草稿箱 ---------------- */
    const drafts = {
        list() {
            return local.get('drafts', []);
        },
        load(id) {
            return local.get('draft:' + id);
        },
        save(id, data) {
            const title = (data.title || '').slice(0, 40) || '未命名草稿';
            const list = drafts.list().filter((d) => d.id !== id);
            list.unshift({ id, title, updated: Date.now() });
            list.slice(30).forEach((d) => local.remove('draft:' + d.id));
            local.set('drafts', list.slice(0, 30));
            return local.set('draft:' + id, data);
        },
        remove(id) {
            local.set('drafts', drafts.list().filter((d) => d.id !== id));
            local.remove('draft:' + id);
        },
        newId() {
            return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        },
    };

    return { local, assets, drafts };
})();
