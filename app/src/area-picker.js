// A search box for choosing your council area from the official list (core/areas.js).
// You type, pick from the suggestions, and can only save a name that is on the list.
// People outside the UK type "outside" (or "abroad") and pick "Outside the UK".
import { OUTSIDE, searchAreas, resolveArea } from "./core/areas.js";

let uid = 0;

export function mountAreaPicker(input, { onPick } = {}) {
  const id = "ap" + (++uid);
  const wrap = document.createElement("div");
  wrap.className = "apick";
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);

  const list = document.createElement("ul");
  list.className = "aplist"; list.id = id + "-list"; list.setAttribute("role", "listbox"); list.hidden = true;
  const msg = document.createElement("p");
  msg.className = "hint apmsg"; msg.id = id + "-msg"; msg.setAttribute("role", "status"); msg.setAttribute("aria-live", "polite");
  wrap.append(list, msg);

  input.setAttribute("role", "combobox");
  input.setAttribute("aria-autocomplete", "list");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-controls", list.id);
  input.setAttribute("aria-describedby", msg.id);
  input.setAttribute("autocomplete", "off");
  input.setAttribute("autocapitalize", "words");

  let results = [], active = -1, picking = false;
  const say = (t, bad) => { msg.textContent = t || ""; msg.classList.toggle("bad", !!bad); };
  const close = () => { list.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); active = -1; };
  const setActive = i => {
    active = i;
    [...list.children].forEach((li, k) => { li.classList.toggle("on", k === i); li.setAttribute("aria-selected", String(k === i)); });
    if (i >= 0 && list.children[i]) { input.setAttribute("aria-activedescendant", list.children[i].id); list.children[i].scrollIntoView({ block: "nearest" }); }
    else input.removeAttribute("aria-activedescendant");
  };
  const pick = a => {
    input.value = a.label;
    close(); say(a === OUTSIDE ? "Saved as outside the UK." : "Your area: " + a.label + ".");
    picking = true; input.dispatchEvent(new Event("input", { bubbles: true })); picking = false;
    if (onPick) onPick(a);
  };
  const render = () => {
    results = searchAreas(input.value, 8);
    list.innerHTML = "";
    if (!input.value.trim()) { close(); return; }
    if (!results.length) {
      const li = document.createElement("li");
      li.className = "apno"; li.setAttribute("role", "presentation");
      li.textContent = "No council found. Check the spelling, or type \"outside\" if you live outside the UK.";
      list.appendChild(li);
    }
    results.forEach((a, k) => {
      const li = document.createElement("li");
      li.id = id + "-o" + k; li.setAttribute("role", "option"); li.setAttribute("aria-selected", "false");
      li.innerHTML = `<b></b><span></span>`;
      li.firstChild.textContent = a.name;
      li.lastChild.textContent = a === OUTSIDE ? "Not in the UK" : [a.county, a.region].filter(Boolean).filter((x, i, arr) => arr.indexOf(x) === i).join(" · ");
      li.addEventListener("mousedown", e => { e.preventDefault(); pick(a); });
      list.appendChild(li);
    });
    list.hidden = false; input.setAttribute("aria-expanded", "true"); setActive(results.length ? 0 : -1);
  };

  input.addEventListener("input", () => { if (picking) return; say(""); render(); });
  input.addEventListener("focus", () => { if (input.value.trim() && !resolveArea(input.value)) render(); });
  input.addEventListener("blur", () => { const a = resolveArea(input.value); if (a && input.value !== a.label) { input.value = a.label; } setTimeout(close, 0); });
  input.addEventListener("keydown", e => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (list.hidden) { render(); return; }
      if (!results.length) return;
      e.preventDefault();
      setActive((active + (e.key === "ArrowDown" ? 1 : -1) + results.length) % results.length);
    } else if (e.key === "Enter" && !list.hidden && results[active]) { e.preventDefault(); e.stopPropagation(); pick(results[active]); }
    else if (e.key === "Escape" && !list.hidden) { e.preventDefault(); e.stopPropagation(); close(); }
  });

  return {
    area: () => resolveArea(input.value),
    set(label) { input.value = label || ""; say(""); close(); },
    say,
  };
}
