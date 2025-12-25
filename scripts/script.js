const STORAGE_KEY = "retractly_tags";
const tagMap = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
let pendingSelection = null;
let isProcessing = false;

function saveTags() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tagMap));
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function saveCursorPosition(context) {
    const selection = window.getSelection();
    if (selection.rangeCount === 0) {
        return null;
    }
    const range = selection.getRangeAt(0);
    const preSelectionRange = range.cloneRange();
    preSelectionRange.selectNodeContents(context);
    preSelectionRange.setEnd(range.startContainer, range.startOffset);
    const start = preSelectionRange.toString().length;

    return {
        start: start,
        end: start + range.toString().length
    };
}

function restoreCursorPosition(context, savedPosition) {
    if (!savedPosition) {
        return;
    }
    const selection = window.getSelection();
    let charIndex = 0;
    const range = document.createRange();
    range.setStart(context, 0);
    range.collapse(true);
    const nodeStack = [context];
    let node;
    let foundStart = false;
    let stop = false;

    while (!stop && (node = nodeStack.pop())) {
        if (node.nodeType === 3) {
            const nextCharIndex = charIndex + node.length;
            if (!foundStart && savedPosition.start >= charIndex && savedPosition.start <= nextCharIndex) {
                range.setStart(node, savedPosition.start - charIndex);
                foundStart = true;
            }
            if (foundStart && savedPosition.end >= charIndex && savedPosition.end <= nextCharIndex) {
                range.setEnd(node, savedPosition.end - charIndex);
                stop = true;
            }
            charIndex = nextCharIndex;
        } else {
            let i = node.childNodes.length;
            while (i--) {
                nodeStack.push(node.childNodes[i]);
            }
        }
    }
    selection.removeAllRanges();
    selection.addRange(range);
}

function moveCursorOutsideTag(editor) {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;

  let node = sel.anchorNode;
  if (!node) return;

  // If cursor is inside text node, move up
  if (node.nodeType === 3) {
    node = node.parentNode;
  }

  // If inside a tag span, move cursor after it
  if (node.classList && node.classList.contains("tag")) {
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    editor.focus();
  }
}

/* ---------- Color logic (deterministic) ---------- */

function colorForTag(tag) {
  let hash = 0;
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 85%, 80%)`; // pastel
}

/* ---------- Core pipeline ---------- */

function getPlainText() {
  return document.getElementById("input").innerText;
}

function autoRedactPlainText(text) {
  for (const tag in tagMap) {
    const value = tagMap[tag];
    const pattern = new RegExp(escapeRegex(value), "gi");
    text = text.replace(pattern, `{{${tag}}}`);
  }
  return text;
}

function renderHighlightedHTML(text) {
  let html = text;
  for (const tag in tagMap) {
    const pattern = new RegExp(`{{${escapeRegex(tag)}}}`, "g");
    const color = colorForTag(tag);
    html = html.replace(
      pattern,
      `<span class="tag" style="background:${color}">{{${tag}}}</span>`
    );
  }
  return html;
}

function processEditor() {
    if (isProcessing) return;
    isProcessing = true;

    const editor = document.getElementById("input");
    const tags = editor.querySelectorAll('.tag');
    tags.forEach(tag => tag.classList.add('shake'));

    setTimeout(() => {
        const savedCursorPosition = saveCursorPosition(editor);
        const plain = getPlainText();
        const redacted = autoRedactPlainText(plain);
        editor.innerHTML = renderHighlightedHTML(redacted);
        restoreCursorPosition(editor, savedCursorPosition);
        moveCursorOutsideTag(editor);
        tags.forEach(tag => tag.classList.remove('shake'));
        isProcessing = false;
    }, 2000);
}
/* ---------- Tag UI ---------- */

function renderTags() {
  const container = document.getElementById("tags");
  container.innerHTML = "<h4>Tag Map</h4>";

  for (const tag in tagMap) {
    const row = document.createElement("div");
    row.className = "tag-row";

    const label = document.createElement("strong");
    label.textContent = `{{${tag}}}`;
    label.style.background = colorForTag(tag);
    label.style.padding = "2px 6px";
    label.style.borderRadius = "4px";

    const input = document.createElement("input");
    input.value = tagMap[tag];
    input.onchange = () => {
      tagMap[tag] = input.value;
      saveTags();
      processEditor();
    };

    const del = document.createElement("button");
    del.textContent = "✕";
    del.onclick = () => {
      delete tagMap[tag];
      saveTags();
      renderTags();
      processEditor();
    };

    row.append(label, input, del);
    container.appendChild(row);
  }
}

function prepareTagSelection() {
  const sel = window.getSelection();
  if (!sel || sel.toString().trim() === "") {
    alert("Select text first");
    return;
  }

  pendingSelection = sel.toString();

  const dropdown = document.getElementById("tagDropdown");
  dropdown.innerHTML = "";
  dropdown.style.display = "inline";

  const placeholder = document.createElement("option");
  placeholder.textContent = "Select tag…";
    placeholder.disabled = true;
    placeholder.selected = true;
  dropdown.appendChild(placeholder);

  for (const tag in tagMap) {
    const opt = document.createElement("option");
    opt.value = tag;
    opt.textContent = tag;
    dropdown.appendChild(opt);
  }

  const createOpt = document.createElement("option");
  createOpt.value = "__new__";
  createOpt.textContent = "+ Create new tag";
  dropdown.appendChild(createOpt);
}

function handleTagChoice() {
  const dropdown = document.getElementById("tagDropdown");
  const choice = dropdown.value;
  dropdown.style.display = "none";

  if (!pendingSelection) return;

  let tag = choice;

  if (choice === "__new__") {
    tag = prompt("Enter new tag name:");
    if (!tag) {
      pendingSelection = null;
      return;
    }
    tagMap[tag] = pendingSelection;
    saveTags();
    renderTags();
  }

  const editor = document.getElementById("input");
  const plain = getPlainText();
  const pattern = new RegExp(escapeRegex(pendingSelection), "gi");
  const replaced = plain.replace(pattern, `{{${tag}}}`);
  editor.innerHTML = renderHighlightedHTML(replaced);

  const allTags = editor.querySelectorAll('.tag');
  for (let i = 0; i < allTags.length; i++) {
    if (allTags[i].textContent === `{{${tag}}}`) {
      const range = document.createRange();
      const sel = window.getSelection();
      range.setStartAfter(allTags[i]);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      editor.focus();
      break;
    }
  }

  pendingSelection = null;
}

function exportTags() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(tagMap));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "tags.json");
    document.body.appendChild(downloadAnchorNode); // required for firefox
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
}

function importTags() {
    document.getElementById('importFile').click();
}

function handleFileSelect(event) {
    const reader = new FileReader();
    reader.onload = function(event) {
        const newTagMap = JSON.parse(event.target.result);
        for (const tag in newTagMap) {
            tagMap[tag] = newTagMap[tag];
        }
        saveTags();
        renderTags();
        processEditor();
    };
    reader.readAsText(event.target.files[0]);
}

function unredact() {
  let text = document.getElementById("ai").value;
  for (const tag in tagMap) {
    const pattern = new RegExp(`{{${escapeRegex(tag)}}}`, "g");
    text = text.replace(pattern, tagMap[tag]);
  }
  document.getElementById("ai").value = text;
}

document.getElementById("input").addEventListener("input", processEditor);

renderTags();
