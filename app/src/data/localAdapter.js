export function localDb() {
    const KEY = "shiftbook.data.v1";
    const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { return {}; } };
    let data = read(), queued = false;
    const subs = new Set();
    const emit = () => { if (queued) return; queued = true; queueMicrotask(() => { queued = false; subs.forEach(f => f()); }); };
    const write = mut => { const next = { ...data }; mut(next); localStorage.setItem(KEY, JSON.stringify(next)); data = next; emit(); };
    addEventListener("storage", e => { if (e.key === KEY) { data = read(); emit(); } });
    const listen = f => { subs.add(f); f(); return () => subs.delete(f); };
    const col = cp => ({
        doc: id => doc(cp + "/" + id),
        limit: () => col(cp),
        onSnapshot: cb => listen(() => cb({ docs: Object.keys(data).filter(k => k.startsWith(cp + "/") && !k.slice(cp.length + 1).includes("/")).map(k => ({ id: k.slice(cp.length + 1), data: () => data[k] })) }))
    });
    const doc = p => ({
        set: async v => write(d => { d[p] = JSON.parse(JSON.stringify(v)); }),
        update: async v => write(d => { d[p] = { ...(d[p] || {}), ...JSON.parse(JSON.stringify(v)) }; }),
        delete: async () => write(d => { delete d[p]; }),
        collection: name => col(p + "/" + name),
        onSnapshot: cb => listen(() => cb({ exists: p in data, data: () => data[p] }))
    });
    return { doc };
}

export const localDownloads = {
    save: async ({ filename, data }) => {
        const url = URL.createObjectURL(new Blob([data], { type: filename.endsWith(".csv") ? "text/csv" : "application/json" }));
        const a = document.createElement("a"); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
};