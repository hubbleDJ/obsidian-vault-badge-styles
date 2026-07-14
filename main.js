const {
  ButtonComponent,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFile,
  TFolder,
} = require('obsidian');

const PLUGIN_ID = 'vault-badge-styles';
const PLUGIN_NAME = 'Vault Badge Styles';
const CONFIG_EXPORT_PATH = 'vault-badge-styles.config.json';
const CONFIG_EXPORT_VERSION = 1;
const ICON_FILE_EXTENSIONS = ['svg', 'png', 'webp', 'jpg', 'jpeg'];
const ICON_FILE_EXTENSION_RE = /\.(svg|png|webp|jpe?g)$/i;
const ICON_CLASS = 'mic-icon';
const FILE_EXPLORER_ICON_CLASS = 'mic-file-explorer-icon';
const LINK_ICON_CLASS = 'mic-link-icon';
const TAB_HEADER_ICON_CLASS = 'mic-tab-header-icon';
const COLORED_TEXT_CLASS = 'mic-colored-text';
const ORIGINAL_TEXT_ATTR = 'data-hide-link-path-original-text';
const SHORTENED_CLASS = 'hide-link-path-shortened';
const TAG_STYLE_INTERNAL_LINKS_CLASS = 'mic-tag-style-internal-links';
const TAG_STYLE_EXTERNAL_LINKS_CLASS = 'mic-tag-style-external-links';
const TAG_STYLE_FILE_EXPLORER_CLASS = 'mic-tag-style-file-explorer';
const TAG_STYLE_LIVE_PREVIEW_CLASS = 'mic-tag-style-live-preview-links';
const TAG_STYLE_PROPERTY_VALUES_CLASS = 'mic-tag-style-property-values';
const ICON_COLOR_MODE_ORIGINAL = 'original';
const ICON_COLOR_MODE_TEXT = 'text';
const ICON_COLOR_MODE_CUSTOM = 'custom';
const PROPERTY_VALUE_ATTR = 'data-mic-property-value';
const PROPERTY_VALUE_WRAPPER_ATTR = 'data-mic-property-value-wrapper';
const PROPERTY_VALUE_CONTENT_SELECTOR = [
  '.multi-select-pill-content',
  '.metadata-property-value-text',
  '.metadata-property-value-pill-content',
  '.metadata-link-inner',
  '.table-cell-wrapper',
  '.table-cell-content',
  '.base-table-cell-value',
  '.bases-table-cell-value',
].join(', ');
const PROPERTY_VALUE_CONTROL_SELECTOR = [
  '.multi-select-pill-remove-button',
  '.metadata-property-value-remove',
  '.metadata-link-flair',
  '.metadata-link-icon',
  '.metadata-property-value-external-link',
  '.clickable-icon',
  'button',
  'svg',
].join(', ');

const DEFAULT_SETTINGS = {
  iconSearchPaths: [
    '_Artifacts/Attachments/icons/me',
    '_Artifacts/Attachments/icons',
    '.obsidian/icons',
  ],
  iconSize: '1.15em',
  linkIconSize: '1.1em',
  fileExplorerIconSize: '1.1em',
  folderRules: [],
  fileRules: [],
  externalLinkRules: [],
  propertyValueRules: [],
  enableFileExplorer: true,
  enableTabHeaders: true,
  enableReadingViewLinks: true,
  enableLivePreviewLinks: false,
  enableGenericInternalLinks: true,
  enablePropertyValues: true,
  enableShortenInternalLinks: true,
  enableShortenTags: true,
  enableTagStyleInternalLinks: true,
  enableTagStyleExternalLinks: true,
  enableTagStyleFileExplorer: true,
  enableTagStyleLivePreviewLinks: true,
  enableTagStylePropertyValues: true,
  autoUpdateRulePathsOnRename: true,
  tagBackgroundOpacity: 28,
};

function debounce(fn, delayMs) {
  let timeout = null;
  return (...args) => {
    if (timeout) window.clearTimeout(timeout);
    timeout = window.setTimeout(() => {
      timeout = null;
      fn(...args);
    }, delayMs);
  };
}

function normalizeVaultPath(path) {
  return String(path || '').replace(/^\/+/, '').replace(/\\/g, '/');
}

function basenameWithoutExtension(path) {
  const filename = normalizeVaultPath(path).split('/').pop() || '';
  const extensionIndex = filename.lastIndexOf('.');
  return extensionIndex > 0 ? filename.slice(0, extensionIndex) : filename;
}

function hasIconFileExtension(path) {
  return ICON_FILE_EXTENSION_RE.test(normalizeVaultPath(path));
}

function getIconFileExtension(path) {
  const match = normalizeVaultPath(path).match(ICON_FILE_EXTENSION_RE);
  return match ? match[1].toLowerCase() : '';
}

function dirname(path) {
  const parts = normalizeVaultPath(path).split('/');
  parts.pop();
  return parts.join('/');
}

function folderName(path) {
  return normalizeVaultPath(path).split('/').filter(Boolean).pop() || '';
}

function isLikelyFilePath(path) {
  const filename = normalizeVaultPath(path).split('/').pop() || '';
  return /\.[^/.]+$/.test(filename);
}

function pathToFolderNotePath(path) {
  const normalized = normalizeVaultPath(path);
  const name = folderName(normalized);
  return name ? `${normalized}/${name}.md` : null;
}

function normalizeRuleType(rule, normalizedPath) {
  const type = String(rule.type || '').toLowerCase();
  if (type === 'folder') return 'folder';
  if (type === 'file') return 'file';
  return isLikelyFilePath(normalizedPath) ? 'file' : 'folder';
}

function normalizeIconSource(rule) {
  const source = String(rule.iconSource || rule.iconType || 'svg').toLowerCase();
  if (source === 'text' || source === 'emoji') return 'text';
  return 'svg';
}

function normalizeIconColorMode(rule) {
  const mode = String(rule.iconColorMode || '').toLowerCase();
  if (mode === ICON_COLOR_MODE_TEXT || mode === ICON_COLOR_MODE_CUSTOM) return mode;
  if (rule && rule.colorizeIcon === true) {
    return rule.iconColor ? ICON_COLOR_MODE_CUSTOM : ICON_COLOR_MODE_TEXT;
  }
  return ICON_COLOR_MODE_ORIGINAL;
}

function canRuleIconUseColor(rule) {
  if (normalizeIconSource(rule) !== 'svg') return false;
  const extension = getIconFileExtension(rule.icon || '');
  return !extension || extension === 'svg';
}

function normalizeOpacity(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue)) return DEFAULT_SETTINGS.tagBackgroundOpacity;
  return Math.max(0, Math.min(100, numberValue));
}

function hexToRgbChannels(color) {
  const normalized = String(color || '').trim();
  const shortMatch = normalized.match(/^#([0-9a-f]{3})$/i);
  if (shortMatch) {
    return shortMatch[1]
      .split('')
      .map((char) => parseInt(char + char, 16))
      .join(', ');
  }

  const fullMatch = normalized.match(/^#([0-9a-f]{6})$/i);
  if (!fullMatch) return null;

  const hex = fullMatch[1];
  return [
    parseInt(hex.slice(0, 2), 16),
    parseInt(hex.slice(2, 4), 16),
    parseInt(hex.slice(4, 6), 16),
  ].join(', ');
}

function normalizeHexColorInput(value) {
  const normalized = String(value || '').trim();
  const shortMatch = normalized.match(/^#?([0-9a-f]{3})$/i);
  if (shortMatch) {
    return `#${shortMatch[1]
      .split('')
      .map((char) => char + char)
      .join('')
      .toUpperCase()}`;
  }

  const fullMatch = normalized.match(/^#?([0-9a-f]{6})$/i);
  if (fullMatch) return `#${fullMatch[1].toUpperCase()}`;

  return null;
}

function applyBackgroundVariables(element, color) {
  if (!color) {
    element.style.removeProperty('--mic-background-color');
    element.style.removeProperty('--mic-background-rgb');
    return;
  }

  element.style.setProperty('--mic-background-color', color);
  const rgbChannels = hexToRgbChannels(color);
  if (rgbChannels) {
    element.style.setProperty('--mic-background-rgb', rgbChannels);
  } else {
    element.style.removeProperty('--mic-background-rgb');
  }
}

function applyStyleBackgroundVariables(element, style) {
  if (!style || !style.backgroundColor) {
    applyBackgroundVariables(element, null);
    return;
  }

  applyBackgroundVariables(element, style.fillBackground === false ? 'transparent' : style.backgroundColor);
}

function addHexColorSetting(containerEl, options) {
  const {
    name,
    desc,
    rule,
    property,
    fallback = '#FFFFFF',
    placeholder = '#FFFFFF',
  } = options;
  const fallbackColor = normalizeHexColorInput(rule[property]) || normalizeHexColorInput(fallback) || '#FFFFFF';
  let colorPicker = null;
  let hexInput = null;

  return new Setting(containerEl)
    .setName(name)
    .setDesc(desc)
    .addColorPicker((color) => {
      colorPicker = color;
      color
        .setValue(fallbackColor)
        .onChange((value) => {
          const normalized = normalizeHexColorInput(value);
          if (!normalized) return;

          rule[property] = normalized;
          if (hexInput) {
            hexInput.inputEl.removeClass('mic-color-hex-input-invalid');
            hexInput.setValue(normalized);
          }
        });
    })
    .addText((text) => {
      hexInput = text;
      text.inputEl.addClass('mic-color-hex-input');
      text
        .setPlaceholder(placeholder)
        .setValue(normalizeHexColorInput(rule[property]) || fallbackColor)
        .onChange((value) => {
          if (!value.trim()) {
            delete rule[property];
            text.inputEl.removeClass('mic-color-hex-input-invalid');
            return;
          }

          const normalized = normalizeHexColorInput(value);
          if (!normalized) {
            text.inputEl.addClass('mic-color-hex-input-invalid');
            return;
          }

          rule[property] = normalized;
          text.inputEl.removeClass('mic-color-hex-input-invalid');
          if (colorPicker) colorPicker.setValue(normalized);
          if (text.getValue() !== normalized) text.setValue(normalized);
        });
    });
}

function clonePlainRule(rule) {
  return JSON.parse(JSON.stringify(rule || {}));
}

function uniqueNormalizedValues(values, normalizeValue) {
  const seen = new Set();
  const normalizedValues = [];

  for (const value of values || []) {
    const normalized = normalizeValue(value);
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    normalizedValues.push(normalized);
  }

  return normalizedValues;
}

function getEditablePathRulePaths(rule) {
  const sourceRule = rule || {};
  if (Array.isArray(sourceRule.paths) && sourceRule.paths.length) {
    return sourceRule.paths.map((path) => normalizeVaultPath(path).trim());
  }
  return [normalizeVaultPath(sourceRule.path).trim()];
}

function getPathRulePaths(rule) {
  const sourceRule = rule || {};
  const values = [];
  if (sourceRule.path !== undefined) values.push(sourceRule.path);
  if (Array.isArray(sourceRule.paths)) values.push(...sourceRule.paths);
  return uniqueNormalizedValues(values, (path) => normalizeVaultPath(path).trim());
}

function setEditablePathRulePaths(rule, paths) {
  const normalizedPaths = (paths && paths.length ? paths : ['']).map((path) => normalizeVaultPath(path).trim());
  rule.path = normalizedPaths[0] || '';
  if (normalizedPaths.length > 1) {
    rule.paths = normalizedPaths;
  } else {
    delete rule.paths;
  }
}

function getEditableExternalRulePrefixes(rule) {
  const sourceRule = rule || {};
  if (Array.isArray(sourceRule.prefixes) && sourceRule.prefixes.length) {
    return sourceRule.prefixes.map((prefix) => String(prefix || '').trim());
  }
  return [String(sourceRule.prefix || sourceRule.urlPrefix || '').trim()];
}

function getExternalRulePrefixes(rule) {
  const sourceRule = rule || {};
  const values = [];
  if (sourceRule.prefix !== undefined || sourceRule.urlPrefix !== undefined) {
    values.push(sourceRule.prefix || sourceRule.urlPrefix);
  }
  if (Array.isArray(sourceRule.prefixes)) values.push(...sourceRule.prefixes);
  return uniqueNormalizedValues(values, (prefix) => String(prefix || '').trim());
}

function setEditableExternalRulePrefixes(rule, prefixes) {
  const normalizedPrefixes = (prefixes && prefixes.length ? prefixes : ['']).map((prefix) => String(prefix || '').trim());
  rule.prefix = normalizedPrefixes[0] || '';
  if (normalizedPrefixes.length > 1) {
    rule.prefixes = normalizedPrefixes;
  } else {
    delete rule.prefixes;
  }
}

function setRuleFillBackground(rule, value) {
  if (value) {
    delete rule.fillBackground;
  } else {
    rule.fillBackground = false;
  }
}

function setRuleIconColorMode(rule, value) {
  const mode = normalizeIconColorMode({ iconColorMode: value });
  if (mode === ICON_COLOR_MODE_ORIGINAL) {
    delete rule.iconColorMode;
    delete rule.iconColor;
    return;
  }

  rule.iconColorMode = mode;
  if (mode === ICON_COLOR_MODE_CUSTOM && !rule.iconColor) {
    rule.iconColor = rule.textColor || '#FFFFFF';
  }
  if (mode !== ICON_COLOR_MODE_CUSTOM) {
    delete rule.iconColor;
  }
}

function isSvgIconStyle(style) {
  if (!style || style.iconSource === 'text') return false;
  const sourcePath = style.iconVaultPath || style.icon || '';
  return getIconFileExtension(sourcePath) === 'svg';
}

function getEffectiveIconColor(style) {
  if (!isSvgIconStyle(style)) return null;
  const mode = normalizeIconColorMode(style);
  if (mode === ICON_COLOR_MODE_TEXT) return style.textColor || 'currentColor';
  if (mode === ICON_COLOR_MODE_CUSTOM) return style.iconColor || style.textColor || null;
  return null;
}

function addIconColorSettings(containerEl, rule, rerender) {
  if (!canRuleIconUseColor(rule)) return;

  const mode = normalizeIconColorMode(rule);

  new Setting(containerEl)
    .setName('Цвет иконки')
    .setDesc('Для SVG можно оставить оригинал, взять цвет текста или задать отдельный цвет. PNG/WebP/JPG остаются в оригинальном виде.')
    .addDropdown((dropdown) => {
      dropdown
        .addOption(ICON_COLOR_MODE_ORIGINAL, 'Оригинальный')
        .addOption(ICON_COLOR_MODE_TEXT, 'Как цвет текста')
        .addOption(ICON_COLOR_MODE_CUSTOM, 'Свой цвет')
        .setValue(mode)
        .onChange((value) => {
          setRuleIconColorMode(rule, value);
          rerender();
        });
    });

  if (mode === ICON_COLOR_MODE_CUSTOM) {
    addHexColorSetting(containerEl, {
      name: 'Цвет SVG-иконки',
      desc: 'Одноцветная перекраска SVG через маску. Сложные многоцветные SVG лучше оставлять в оригинальном режиме.',
      rule,
      property: 'iconColor',
      fallback: rule.textColor || '#FFFFFF',
    });
  }
}

function renameVaultPath(path, oldPath, newPath, includeChildren) {
  const normalizedPath = normalizeVaultPath(path).trim();
  const normalizedOldPath = normalizeVaultPath(oldPath).trim();
  const normalizedNewPath = normalizeVaultPath(newPath).trim();

  if (!normalizedPath || !normalizedOldPath || !normalizedNewPath || normalizedOldPath === normalizedNewPath) {
    return null;
  }

  if (normalizedPath === normalizedOldPath) return normalizedNewPath;
  if (includeChildren && normalizedPath.startsWith(`${normalizedOldPath}/`)) {
    return `${normalizedNewPath}${normalizedPath.slice(normalizedOldPath.length)}`;
  }

  return null;
}

function renamePathRules(rules, oldPath, newPath, type, includeChildren) {
  let changed = 0;
  const nextRules = (Array.isArray(rules) ? rules : []).map((rule) => {
    const cleanedRule = cleanPathRule(rule, type);
    const nextPaths = getPathRulePaths(cleanedRule).map((path) => {
      const renamedPath = renameVaultPath(path, oldPath, newPath, includeChildren);
      if (!renamedPath) return path;

      changed += 1;
      return renamedPath;
    });

    return cleanPathRule({ ...cleanedRule, path: nextPaths[0] || '', paths: nextPaths }, type);
  });

  return { rules: nextRules, changed };
}

function cleanPathRule(rule, forcedType) {
  const sourceRule = rule || {};
  const paths = getPathRulePaths(sourceRule);
  const normalizedPath = paths[0] || '';
  const type = forcedType || normalizeRuleType(sourceRule, normalizedPath);
  const iconSource = normalizeIconSource(sourceRule);

  const nextRule = {
    type,
    path: normalizedPath,
  };
  if (paths.length > 1) nextRule.paths = paths;

  if (sourceRule.icon) {
    nextRule.iconSource = iconSource;
    nextRule.icon = String(sourceRule.icon).trim();
  }
  if (sourceRule.textColor) nextRule.textColor = String(sourceRule.textColor).trim();
  if (sourceRule.backgroundColor) {
    nextRule.backgroundColor = String(sourceRule.backgroundColor).trim();
  } else if (sourceRule.textColor) {
    nextRule.backgroundColor = String(sourceRule.textColor).trim();
  }
  if (sourceRule.fillBackground === false) nextRule.fillBackground = false;
  const iconColorMode = normalizeIconColorMode(sourceRule);
  if (canRuleIconUseColor(sourceRule) && iconColorMode !== ICON_COLOR_MODE_ORIGINAL) {
    nextRule.iconColorMode = iconColorMode;
    if (iconColorMode === ICON_COLOR_MODE_CUSTOM && sourceRule.iconColor) {
      nextRule.iconColor = String(sourceRule.iconColor).trim();
    }
  }
  if (type === 'folder') nextRule.cascade = Boolean(sourceRule.cascade);

  return nextRule;
}

function cleanRule(rule) {
  return cleanPathRule(rule);
}

function cleanExternalLinkRule(rule) {
  const sourceRule = rule || {};
  const prefixes = getExternalRulePrefixes(sourceRule);
  const prefix = prefixes[0] || '';
  const iconSource = normalizeIconSource(sourceRule);
  const nextRule = { prefix };
  if (prefixes.length > 1) nextRule.prefixes = prefixes;

  if (sourceRule.icon) {
    nextRule.iconSource = iconSource;
    nextRule.icon = String(sourceRule.icon).trim();
  }
  if (sourceRule.textColor) nextRule.textColor = String(sourceRule.textColor).trim();
  if (sourceRule.backgroundColor) {
    nextRule.backgroundColor = String(sourceRule.backgroundColor).trim();
  } else if (sourceRule.textColor) {
    nextRule.backgroundColor = String(sourceRule.textColor).trim();
  }
  if (sourceRule.fillBackground === false) nextRule.fillBackground = false;
  const iconColorMode = normalizeIconColorMode(sourceRule);
  if (canRuleIconUseColor(sourceRule) && iconColorMode !== ICON_COLOR_MODE_ORIGINAL) {
    nextRule.iconColorMode = iconColorMode;
    if (iconColorMode === ICON_COLOR_MODE_CUSTOM && sourceRule.iconColor) {
      nextRule.iconColor = String(sourceRule.iconColor).trim();
    }
  }

  return nextRule;
}

function normalizePropertyName(value) {
  return String(value || '').trim();
}

function normalizePropertyNameKey(value) {
  return normalizePropertyName(value).toLowerCase();
}

function normalizePropertyValue(value) {
  return String(value || '').trim().replace(/\s+/g, ' ');
}

function normalizeRenderedPropertyValue(value) {
  return normalizePropertyValue(value).replace(/\s*[×✕]\s*$/, '').trim();
}

function normalizePropertyValueKey(value) {
  return normalizePropertyValue(value).toLowerCase();
}

function propertyValueRuleKey(propertyName, value) {
  return `${normalizePropertyNameKey(propertyName)}\u0000${normalizePropertyValueKey(value)}`;
}

function normalizePropertyValuePair(pair) {
  const sourcePair = pair || {};
  return {
    property: normalizePropertyName(sourcePair.property || sourcePair.propertyName || sourcePair.key),
    value: normalizePropertyValue(sourcePair.value),
  };
}

function getEditablePropertyValuePairs(rule) {
  const sourceRule = rule || {};
  if (Array.isArray(sourceRule.pairs) && sourceRule.pairs.length) {
    return sourceRule.pairs.map((pair) => normalizePropertyValuePair(pair));
  }
  return [normalizePropertyValuePair(sourceRule)];
}

function getPropertyValueRulePairs(rule) {
  const sourceRule = rule || {};
  const values = [];
  if (sourceRule.property !== undefined || sourceRule.propertyName !== undefined || sourceRule.key !== undefined || sourceRule.value !== undefined) {
    values.push(sourceRule);
  }
  if (Array.isArray(sourceRule.pairs)) values.push(...sourceRule.pairs);

  const seen = new Set();
  const pairs = [];
  for (const value of values) {
    const pair = normalizePropertyValuePair(value);
    if (!pair.property || !pair.value) continue;
    const key = propertyValueRuleKey(pair.property, pair.value);
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push(pair);
  }

  return pairs;
}

function setEditablePropertyValuePairs(rule, pairs) {
  const normalizedPairs = (pairs && pairs.length ? pairs : [{}]).map((pair) => normalizePropertyValuePair(pair));
  rule.property = normalizedPairs[0] ? normalizedPairs[0].property : '';
  rule.value = normalizedPairs[0] ? normalizedPairs[0].value : '';
  if (normalizedPairs.length > 1) {
    rule.pairs = normalizedPairs;
  } else {
    delete rule.pairs;
  }
}

function formatRuleMatchers(values) {
  const normalizedValues = (values || []).filter(Boolean);
  if (!normalizedValues.length) return '';
  if (normalizedValues.length <= 3) return normalizedValues.join('; ');
  return `${normalizedValues.slice(0, 3).join('; ')} +${normalizedValues.length - 3}`;
}

function cleanPropertyValueRule(rule) {
  const sourceRule = rule || {};
  const pairs = getPropertyValueRulePairs(sourceRule);
  const firstPair = pairs[0] || { property: '', value: '' };
  const iconSource = normalizeIconSource(sourceRule);
  const nextRule = {
    property: firstPair.property,
    value: firstPair.value,
  };

  if (pairs.length > 1) nextRule.pairs = pairs;

  if (sourceRule.icon) {
    nextRule.iconSource = iconSource;
    nextRule.icon = String(sourceRule.icon).trim();
  }
  if (sourceRule.textColor) nextRule.textColor = String(sourceRule.textColor).trim();
  if (sourceRule.backgroundColor) {
    nextRule.backgroundColor = String(sourceRule.backgroundColor).trim();
  } else if (sourceRule.textColor) {
    nextRule.backgroundColor = String(sourceRule.textColor).trim();
  }
  if (sourceRule.fillBackground === false) nextRule.fillBackground = false;
  const iconColorMode = normalizeIconColorMode(sourceRule);
  if (canRuleIconUseColor(sourceRule) && iconColorMode !== ICON_COLOR_MODE_ORIGINAL) {
    nextRule.iconColorMode = iconColorMode;
    if (iconColorMode === ICON_COLOR_MODE_CUSTOM && sourceRule.iconColor) {
      nextRule.iconColor = String(sourceRule.iconColor).trim();
    }
  }

  return nextRule;
}

function flattenPropertyValues(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.flatMap((item) => flattenPropertyValues(item));
  if (value instanceof Date) return [value.toISOString()];
  if (typeof value === 'object') return [];
  const normalized = normalizePropertyValue(value);
  return normalized ? [normalized] : [];
}

function normalizePropertyHeaderText(value) {
  const normalized = normalizePropertyName(value)
    .replace(/[↕↑↓]+/g, '')
    .replace(/^(?:note|file)\./i, '')
    .trim();
  return normalized.replace(/^[^A-Za-zА-Яа-я0-9_#]+/u, '').trim();
}

function getElementDepth(element) {
  let depth = 0;
  let current = element;
  while (current && current.parentElement) {
    depth += 1;
    current = current.parentElement;
  }
  return depth;
}

function labelFromPath(path) {
  return basenameWithoutExtension(path) || folderName(path) || path;
}

function basenameFromPath(value) {
  if (!value || !value.includes('/')) return null;

  const anchorIndex = value.search(/[#^]/);
  const target = anchorIndex === -1 ? value : value.slice(0, anchorIndex);
  const suffix = anchorIndex === -1 ? '' : value.slice(anchorIndex);
  const basename = target.split('/').filter(Boolean).pop();

  return basename ? basename + suffix : null;
}

function isExternalUrl(value) {
  return /^(?:[a-z][a-z0-9+.-]*:\/\/|mailto:|tel:)/i.test(String(value || '').trim());
}

function basenameFromTag(value) {
  if (!value) return null;

  const normalized = value.trim();
  if (!normalized.startsWith('#') || !normalized.includes('/')) return null;

  const body = normalized.slice(1);
  const basename = body.split('/').filter(Boolean).pop();

  return basename || null;
}

function shortenElementText(element, originalText, shortText) {
  if (!shortText || shortText === originalText) return;

  if (!element.hasAttribute(ORIGINAL_TEXT_ATTR)) {
    element.setAttribute(ORIGINAL_TEXT_ATTR, originalText);
  }

  if (!element.hasAttribute('title')) {
    element.setAttribute('title', originalText);
  }

  element.textContent = shortText;
  element.classList.add(SHORTENED_CLASS);
}

function removePluginIconsFromTextSource(element) {
  element.querySelectorAll(`.${ICON_CLASS}`).forEach((iconEl) => iconEl.remove());
}

function shortenRenderedInternalLink(link) {
  removePluginIconsFromTextSource(link);

  const originalText = link.getAttribute(ORIGINAL_TEXT_ATTR) || link.textContent.trim();
  if (!originalText || !originalText.includes('/') || originalText.includes('|')) return;

  shortenElementText(link, originalText, basenameFromPath(originalText));
}

function shortenRenderedTag(tag) {
  const originalText = tag.getAttribute(ORIGINAL_TEXT_ATTR) || tag.textContent.trim();
  shortenElementText(tag, originalText, basenameFromTag(originalText));
}

function processShortenedRenderedElements(root, settings) {
  if (settings.enableShortenInternalLinks) {
    root.querySelectorAll('a.internal-link, span.internal-link').forEach(shortenRenderedInternalLink);
  }
  if (settings.enableShortenTags) {
    root.querySelectorAll('a.tag, span.tag').forEach(shortenRenderedTag);
  }
}

function restoreShortenedRenderedElements(root) {
  root.querySelectorAll(`[${ORIGINAL_TEXT_ATTR}]`).forEach((element) => {
    element.textContent = element.getAttribute(ORIGINAL_TEXT_ATTR);
    element.removeAttribute(ORIGINAL_TEXT_ATTR);
    element.classList.remove(SHORTENED_CLASS);
  });
}

function hasRenderableIcon(style) {
  if (!style) return false;
  if (style.iconSource === 'text') return Boolean(style.icon);
  return Boolean(style.iconPath);
}

function getIconSignature(style) {
  if (!hasRenderableIcon(style)) return '';
  if (style.iconSource === 'text') return `text:${style.icon}`;
  return `file:${style.iconPath}:${normalizeIconColorMode(style)}:${getEffectiveIconColor(style) || ''}`;
}

function createIconElement(style, className, size) {
  const wrapper = document.createElement('span');
  wrapper.classList.add(ICON_CLASS, className);
  wrapper.style.setProperty('--mic-icon-size', size);
  wrapper.setAttribute('aria-hidden', 'true');

  if (style.iconSource === 'text') {
    wrapper.classList.add('mic-icon-text-source');
    const textIcon = document.createElement('span');
    textIcon.classList.add('mic-text-icon');
    textIcon.textContent = style.icon;
    wrapper.appendChild(textIcon);
  } else if (getEffectiveIconColor(style)) {
    wrapper.classList.add('mic-icon-mask-source');
    wrapper.style.setProperty('--mic-icon-color', getEffectiveIconColor(style));
    const mask = document.createElement('span');
    mask.classList.add('mic-icon-mask');
    const iconUrl = String(style.iconPath || '').replace(/"/g, '\\"');
    mask.style.setProperty('-webkit-mask-image', `url("${iconUrl}")`);
    mask.style.setProperty('mask-image', `url("${iconUrl}")`);
    wrapper.appendChild(mask);
  } else {
    const image = document.createElement('img');
    image.src = style.iconPath;
    image.decoding = 'async';
    image.loading = 'lazy';
    wrapper.appendChild(image);
  }

  return wrapper;
}

function isTableLikePropertyValueElement(element) {
  return element.matches([
    'td',
    '[role="gridcell"]',
    '[role="cell"]',
    '.table-cell-wrapper',
    '.base-table-cell',
    '.table-cell',
    '.bases-table-cell',
    '.base-td',
    '.bases-td',
    '.base-cell',
    '.bases-cell',
    '[data-cell]',
    '[data-cell-id]',
  ].join(', '));
}

function unwrapPropertyValueWrapper(wrapperEl) {
  const parentEl = wrapperEl.parentElement;
  if (!parentEl) return;

  while (wrapperEl.firstChild) {
    parentEl.insertBefore(wrapperEl.firstChild, wrapperEl);
  }
  wrapperEl.remove();
}

function clearPropertyValueWrapperInCell(cellEl) {
  cellEl.querySelectorAll(`[${PROPERTY_VALUE_WRAPPER_ATTR}="true"]`).forEach((wrapperEl) => {
    if (wrapperEl instanceof HTMLElement) unwrapPropertyValueWrapper(wrapperEl);
  });
}

function isPropertyValueControlNode(node) {
  if (node instanceof HTMLElement) return node.matches(PROPERTY_VALUE_CONTROL_SELECTOR);
  return node.nodeType === Node.TEXT_NODE && /^[×✕]$/.test(String(node.textContent || '').trim());
}

function getPropertyValueContentElement(valueEl) {
  if (valueEl.matches(PROPERTY_VALUE_CONTENT_SELECTOR)) return valueEl;

  const directContent = valueEl.querySelector(`:scope > ${PROPERTY_VALUE_CONTENT_SELECTOR}`);
  if (directContent instanceof HTMLElement) return directContent;

  return null;
}

function ensurePropertyValueTargetElement(valueEl) {
  const contentEl = getPropertyValueContentElement(valueEl);
  if (contentEl) return contentEl;

  const hasSeparateControl = [...valueEl.childNodes].some((node) => isPropertyValueControlNode(node));
  if (!isTableLikePropertyValueElement(valueEl) && !hasSeparateControl) return valueEl;

  const existingWrapper = valueEl.querySelector(`:scope > [${PROPERTY_VALUE_WRAPPER_ATTR}="true"]`);
  if (existingWrapper instanceof HTMLElement) return existingWrapper;

  const wrapperEl = document.createElement('span');
  wrapperEl.setAttribute(PROPERTY_VALUE_WRAPPER_ATTR, 'true');
  const firstControlNode = [...valueEl.childNodes].find((node) => isPropertyValueControlNode(node));
  const contentNodes = [...valueEl.childNodes].filter((node) => !isPropertyValueControlNode(node));

  contentNodes.forEach((node) => wrapperEl.appendChild(node));

  if (firstControlNode) {
    valueEl.insertBefore(wrapperEl, firstControlNode);
  } else {
    valueEl.appendChild(wrapperEl);
  }

  return wrapperEl;
}

class IconResolver {
  constructor(app, settings) {
    this.app = app;
    this.settings = settings;
    this.cache = new Map();
    this.warnedMissingIcons = new Set();
  }

  setSettings(settings) {
    this.settings = settings;
    this.cache.clear();
    this.warnedMissingIcons.clear();
  }

  async resolveIcon(iconValue) {
    if (!iconValue) return null;

    const normalized = normalizeVaultPath(iconValue);
    if (this.cache.has(normalized)) return this.cache.get(normalized);

    const iconInfo = await this.resolveIconInfo(normalized);
    const resourcePath = iconInfo.resourcePath;

    if (!resourcePath && !this.warnedMissingIcons.has(normalized)) {
      this.warnedMissingIcons.add(normalized);
      console.warn(`[${PLUGIN_ID}] Icon not found: ${normalized}`);
    }

    this.cache.set(normalized, resourcePath);
    return resourcePath;
  }

  async resolveIconInfo(iconValue) {
    if (!iconValue) {
      return {
        vaultPath: null,
        resourcePath: null,
        triedPaths: [],
      };
    }

    const normalized = normalizeVaultPath(iconValue);
    const vaultPath = await this.findIconPath(normalized);

    return {
      vaultPath,
      resourcePath: vaultPath ? this.app.vault.adapter.getResourcePath(vaultPath) : null,
      triedPaths: this.getIconCandidatePaths(normalized),
    };
  }

  getIconCandidatePaths(iconValue) {
    const normalized = normalizeVaultPath(iconValue);
    if (!normalized) return [];

    const iconSearchPaths = Array.isArray(this.settings.iconSearchPaths)
      ? this.settings.iconSearchPaths
      : DEFAULT_SETTINGS.iconSearchPaths;

    const hasExplicitExtension = hasIconFileExtension(normalized);

    if (normalized.includes('/')) {
      return [hasExplicitExtension ? normalized : `${normalized}.svg`];
    }

    return iconSearchPaths.flatMap((searchPath) => {
      const base = normalizeVaultPath(searchPath);
      if (hasExplicitExtension) {
        const iconName = basenameWithoutExtension(normalized);
        return [
          `${base}/${normalized}`,
          `${base}/${iconName}/${normalized}`,
        ];
      }

      return [
        `${base}/${normalized}.svg`,
        `${base}/${normalized}/${normalized}.svg`,
      ];
    });
  }

  async findIconPath(iconValue) {
    for (const candidate of this.getIconCandidatePaths(iconValue)) {
      if (await this.exists(candidate)) return candidate;
    }

    return null;
  }

  async exists(path) {
    try {
      return await this.app.vault.adapter.exists(normalizeVaultPath(path));
    } catch (error) {
      console.warn(`[${PLUGIN_ID}] Failed to check icon path: ${path}`, error);
      return false;
    }
  }
}

class StyleIndex {
  constructor(app, settings, iconResolver) {
    this.app = app;
    this.settings = settings;
    this.iconResolver = iconResolver;
    this.directByFilePath = new Map();
    this.directByFolderPath = new Map();
    this.cascadingFolderStyles = [];
    this.externalPrefixStyles = [];
    this.propertyValueStyles = new Map();
  }

  setSettings(settings) {
    this.settings = settings;
  }

  async rebuild() {
    this.directByFilePath.clear();
    this.directByFolderPath.clear();
    this.cascadingFolderStyles = [];
    this.externalPrefixStyles = [];
    this.propertyValueStyles.clear();

    await this.addSettingsRules();
    this.cascadingFolderStyles.sort((a, b) => b.targetPath.length - a.targetPath.length);
    this.externalPrefixStyles.sort((a, b) => b.prefix.length - a.prefix.length);
  }

  async addSettingsRules() {
    const folderRules = Array.isArray(this.settings.folderRules) ? this.settings.folderRules : [];
    const fileRules = Array.isArray(this.settings.fileRules) ? this.settings.fileRules : [];

    await this.addPathRules(folderRules, 'folder');
    await this.addPathRules(fileRules, 'file');
    await this.addExternalLinkRules(Array.isArray(this.settings.externalLinkRules)
      ? this.settings.externalLinkRules
      : []);
    await this.addPropertyValueRules(Array.isArray(this.settings.propertyValueRules)
      ? this.settings.propertyValueRules
      : []);
  }

  async addPathRules(rules, forcedType) {
    for (const rawRule of rules) {
      const rule = cleanPathRule(rawRule, forcedType);
      const ruleType = rule.type;
      const paths = getPathRulePaths(rule);

      for (const targetPath of paths) {
        if (!targetPath) continue;

        const style = await this.buildStyleFromRule(rule, targetPath);
        if (!style) continue;

        if (ruleType === 'file') {
          this.directByFilePath.set(targetPath, {
            ...style,
            targetPath,
          });
        } else {
          this.directByFolderPath.set(targetPath, style);

          const folderNotePath = pathToFolderNotePath(targetPath);
          const folderNote = folderNotePath ? this.app.vault.getAbstractFileByPath(folderNotePath) : null;
          if (folderNote instanceof TFile) {
            this.directByFilePath.set(folderNote.path, {
              ...style,
              targetPath: folderNote.path,
            });
          }
        }

        if (ruleType === 'folder' && style.cascade) {
          this.cascadingFolderStyles.push(style);
        }
      }
    }
  }

  async addExternalLinkRules(rules) {
    for (const rawRule of rules) {
      const rule = cleanExternalLinkRule(rawRule);
      for (const prefix of getExternalRulePrefixes(rule)) {
        if (!prefix) continue;

        const style = await this.buildStyleFromRule(rule, prefix);
        if (!style) continue;

        this.externalPrefixStyles.push({
          ...style,
          prefix,
          targetPath: prefix,
        });
      }
    }
  }

  async addPropertyValueRules(rules) {
    for (const rawRule of rules) {
      const rule = cleanPropertyValueRule(rawRule);
      for (const pair of getPropertyValueRulePairs(rule)) {
        if (!pair.property || !pair.value) continue;

        const targetPath = `${pair.property}: ${pair.value}`;
        const style = await this.buildStyleFromRule({ ...rule, type: 'property-value' }, targetPath);
        if (!style) continue;

        const nextStyle = {
          ...style,
          property: pair.property,
          value: pair.value,
          targetPath,
          rulePath: targetPath,
          ruleType: 'property-value',
        };

        this.propertyValueStyles.set(propertyValueRuleKey(pair.property, pair.value), nextStyle);
      }
    }
  }

  async buildStyleFromRule(rule, targetPath) {
    const icon = rule.icon ? String(rule.icon) : undefined;
    const iconSource = normalizeIconSource(rule);
    const textColor = rule.textColor ? String(rule.textColor) : undefined;
    const backgroundColor = rule.backgroundColor ? String(rule.backgroundColor) : undefined;
    const fillBackground = rule.fillBackground !== false;
    const iconColorMode = iconSource === 'svg' ? normalizeIconColorMode(rule) : ICON_COLOR_MODE_ORIGINAL;
    const iconColor = iconColorMode === ICON_COLOR_MODE_CUSTOM && rule.iconColor ? String(rule.iconColor) : undefined;
    const cascade = Boolean(rule.cascade);

    if (!icon && !textColor && !backgroundColor && !cascade) return null;

    const iconInfo = icon && iconSource === 'svg'
      ? await this.iconResolver.resolveIconInfo(icon)
      : { vaultPath: null, resourcePath: null };

    return {
      targetPath,
      sourcePath: `settings:${targetPath}`,
      rulePath: targetPath,
      ruleType: rule.type || 'external',
      icon,
      iconSource,
      iconPath: iconInfo.resourcePath,
      iconVaultPath: iconInfo.vaultPath,
      iconColorMode,
      iconColor,
      textColor,
      backgroundColor,
      fillBackground,
      cascade,
    };
  }

  getDirectStyleForPath(path) {
    const normalized = normalizeVaultPath(path);
    return this.directByFilePath.get(normalized) || this.directByFolderPath.get(normalized) || null;
  }

  getEffectiveStyleForExternalUrl(url) {
    const normalized = String(url || '').trim();
    if (!normalized) return null;

    return this.externalPrefixStyles.find((style) => normalized.startsWith(style.prefix)) || null;
  }

  getDirectStyleForExternalPrefix(prefix) {
    const normalized = String(prefix || '').trim();
    return this.externalPrefixStyles.find((style) => style.prefix === normalized) || null;
  }

  getEffectiveStyleForPropertyValue(propertyName, value) {
    const normalizedPropertyName = normalizePropertyName(propertyName);
    const normalizedValue = normalizePropertyValue(value);
    if (!normalizedPropertyName || !normalizedValue) return null;

    return this.propertyValueStyles.get(propertyValueRuleKey(normalizedPropertyName, normalizedValue)) || null;
  }

  getEffectiveStyleForPath(path) {
    const normalized = normalizeVaultPath(path);
    if (!normalized) return null;

    const direct = this.getDirectStyleForPath(normalized);
    const iconSource = this.resolvePropertySource(normalized, direct, 'icon');
    const textColorSource = this.resolvePropertySource(normalized, direct, 'textColor');
    const backgroundColorSource = this.resolvePropertySource(normalized, direct, 'backgroundColor');

    if (!iconSource && !textColorSource && !backgroundColorSource) return null;

    return {
      icon: iconSource ? iconSource.icon : undefined,
      iconSource: iconSource ? iconSource.iconSource : undefined,
      iconPath: iconSource ? iconSource.iconPath : undefined,
      iconVaultPath: iconSource ? iconSource.iconVaultPath : undefined,
      iconColorMode: iconSource ? iconSource.iconColorMode : undefined,
      iconColor: iconSource ? iconSource.iconColor : undefined,
      textColor: textColorSource ? textColorSource.textColor : undefined,
      backgroundColor: backgroundColorSource ? backgroundColorSource.backgroundColor : undefined,
      fillBackground: backgroundColorSource ? backgroundColorSource.fillBackground !== false : undefined,
      sourcePath: (iconSource || textColorSource || backgroundColorSource).sourcePath,
      rulePath: (iconSource || textColorSource || backgroundColorSource).rulePath,
      ruleType: (iconSource || textColorSource || backgroundColorSource).ruleType,
      propertySources: {
        icon: iconSource ? iconSource.rulePath : undefined,
        textColor: textColorSource ? textColorSource.rulePath : undefined,
        backgroundColor: backgroundColorSource ? backgroundColorSource.rulePath : undefined,
      },
      inherited: Boolean(
        (iconSource && iconSource.inherited)
        || (textColorSource && textColorSource.inherited)
        || (backgroundColorSource && backgroundColorSource.inherited)
      ),
    };
  }

  resolvePropertySource(path, direct, propertyName) {
    if (direct && direct[propertyName]) {
      return { ...direct, inherited: false };
    }

    for (const folderStyle of this.cascadingFolderStyles) {
      if (!folderStyle[propertyName]) continue;
      if (this.isInsideFolder(path, folderStyle.targetPath)) {
        return { ...folderStyle, inherited: true };
      }
    }

    return null;
  }

  isInsideFolder(path, folderPath) {
    return path === folderPath || path.startsWith(`${folderPath}/`);
  }

  isFolderNote(file) {
    return Boolean(this.getFolderPathForFolderNote(file));
  }

  getFolderPathForFolderNote(file) {
    if (!(file instanceof TFile) || file.extension !== 'md') return null;

    const directory = dirname(file.path);
    if (!directory) return null;

    return folderName(directory) === file.basename ? directory : null;
  }

  getMatchDetailsForPath(path, type) {
    const normalized = normalizeVaultPath(path);
    const direct = this.getDirectStyleForPath(normalized);
    const iconSource = this.resolvePropertySource(normalized, direct, 'icon');
    const textColorSource = this.resolvePropertySource(normalized, direct, 'textColor');
    const backgroundColorSource = this.resolvePropertySource(normalized, direct, 'backgroundColor');
    const style = this.getEffectiveStyleForPath(normalized);
    const sources = [iconSource, textColorSource, backgroundColorSource].filter(Boolean);
    const rulePaths = [...new Set(sources.map((source) => source.rulePath || source.targetPath).filter(Boolean))];
    const inherited = sources.some((source) => source.inherited);

    return {
      path: normalized,
      type: type || (isLikelyFilePath(normalized) ? 'file' : 'folder'),
      matchedRule: rulePaths.join(', ') || '',
      icon: style ? style.icon : '',
      resolvedIconPath: style ? style.iconVaultPath || '' : '',
      iconColorMode: style ? normalizeIconColorMode(style) : '',
      iconColor: style ? getEffectiveIconColor(style) || '' : '',
      textColor: style ? style.textColor || '' : '',
      backgroundColor: style ? style.backgroundColor || '' : '',
      fillBackground: style ? style.fillBackground !== false : '',
      inherited: style ? inherited : '',
      reason: this.getMatchReason(normalized, style, sources),
    };
  }

  getMatchReason(path, style, sources) {
    if (!style || !sources.length) return 'no matching rule';

    const rulePaths = [...new Set(sources.map((source) => source.rulePath || source.targetPath).filter(Boolean))];
    const inherited = sources.some((source) => source.inherited);

    if (rulePaths.length > 1) return inherited ? 'mixed direct and cascade match' : 'mixed direct match';
    if (inherited) return 'inherited from cascade';
    if (rulePaths[0] === path) return 'exact match';
    return 'direct linked match';
  }

  getDebugRows() {
    return this.getVaultEntries()
      .sort((a, b) => a.path.localeCompare(b.path))
      .map((entry) => this.getMatchDetailsForPath(entry.path, entry.type));
  }

  getVaultEntries() {
    const entries = [];
    const seen = new Set();

    for (const file of this.app.vault.getAllLoadedFiles()) {
      if (!(file instanceof TFile) && !(file instanceof TFolder)) continue;
      if (!file.path || seen.has(file.path)) continue;

      seen.add(file.path);
      entries.push({
        path: file.path,
        type: file instanceof TFolder ? 'folder' : 'file',
      });
    }

    for (const file of this.app.vault.getFiles()) {
      const folderPath = this.getFolderPathForFolderNote(file);
      if (folderPath && !seen.has(folderPath)) {
        seen.add(folderPath);
        entries.push({ path: folderPath, type: 'folder' });
      }
    }

    return entries;
  }
}

class FileExplorerRenderer {
  constructor(app, settings, styleIndex) {
    this.app = app;
    this.settings = settings;
    this.styleIndex = styleIndex;
    this.observer = null;
    this.scheduleRefresh = debounce(() => this.refresh(), 120);
  }

  setSettings(settings) {
    this.settings = settings;
  }

  start() {
    if (this.observer) return;

    this.observer = new MutationObserver(() => {
      if (!this.settings.enableFileExplorer) return;
      if (this.hasActiveRename()) return;
      this.scheduleRefresh();
    });

    this.observer.observe(document.body, { childList: true, subtree: true });
    this.refresh();
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.clearAll();
  }

  refresh() {
    if (!this.settings.enableFileExplorer) {
      this.clearAll();
      return;
    }

    if (this.hasActiveRename()) return;

    document.querySelectorAll('.nav-file-title[data-path], .nav-folder-title[data-path]').forEach((titleEl) => {
      this.applyToFileExplorerTitle(titleEl);
    });
  }

  applyToFileExplorerTitle(titleEl) {
    const path = titleEl.getAttribute('data-path');
    const contentEl = titleEl.querySelector('.nav-file-title-content, .nav-folder-title-content');
    if (!path || !contentEl) return;
    if (this.isRenamingTitle(titleEl)) return;

    const style = this.styleIndex.getEffectiveStyleForPath(path);
    this.applyStyleVariables(contentEl, style);
    this.applyIcon(titleEl, contentEl, style);
  }

  hasActiveRename() {
    const activeEl = document.activeElement;
    if (!activeEl) return false;

    const activeTitle = activeEl.closest?.('.nav-file-title[data-path], .nav-folder-title[data-path]');
    if (activeTitle && this.isRenamingTitle(activeTitle)) return true;

    return Boolean(document.querySelector('.nav-file-title.is-being-renamed, .nav-folder-title.is-being-renamed, .nav-file-title.mod-renaming, .nav-folder-title.mod-renaming'));
  }

  isRenamingTitle(titleEl) {
    if (!titleEl) return false;
    if (titleEl.matches('.is-being-renamed, .mod-renaming')) return true;
    if (titleEl.querySelector('input, textarea, [contenteditable="true"]')) return true;

    const activeEl = document.activeElement;
    if (!activeEl || !titleEl.contains(activeEl)) return false;

    return activeEl.matches?.('input, textarea, [contenteditable="true"]') || Boolean(activeEl.closest?.('input, textarea, [contenteditable="true"]'));
  }

  applyStyleVariables(contentEl, style) {
    if (style && style.textColor) {
      contentEl.classList.add(COLORED_TEXT_CLASS);
      contentEl.style.setProperty('--mic-text-color', style.textColor);
    } else {
      contentEl.classList.remove(COLORED_TEXT_CLASS);
      contentEl.style.removeProperty('--mic-text-color');
    }

    applyStyleBackgroundVariables(contentEl, style);
  }

  applyIcon(titleEl, contentEl, style) {
    const oldDirectIcon = titleEl.querySelector(`:scope > .${ICON_CLASS}.${FILE_EXPLORER_ICON_CLASS}`);
    const existing = contentEl.querySelector(`:scope > .${ICON_CLASS}.${FILE_EXPLORER_ICON_CLASS}`);

    if (!hasRenderableIcon(style)) {
      if (existing) existing.remove();
      if (oldDirectIcon) oldDirectIcon.remove();
      return;
    }

    if (oldDirectIcon) oldDirectIcon.remove();

    const iconSignature = getIconSignature(style);
    if (existing && existing.getAttribute('data-mic-icon-signature') === iconSignature) {
      existing.style.setProperty('--mic-icon-size', this.settings.fileExplorerIconSize);
      return;
    }

    const nextIcon = createIconElement(style, FILE_EXPLORER_ICON_CLASS, this.settings.fileExplorerIconSize);
    nextIcon.setAttribute('data-mic-icon-signature', iconSignature);

    if (existing) {
      existing.replaceWith(nextIcon);
    } else {
      contentEl.insertBefore(nextIcon, contentEl.firstChild);
    }
  }

  clearAll() {
    document.querySelectorAll(`.${ICON_CLASS}.${FILE_EXPLORER_ICON_CLASS}`).forEach((el) => el.remove());
    document.querySelectorAll('.nav-file-title-content, .nav-folder-title-content').forEach((el) => {
      el.classList.remove(COLORED_TEXT_CLASS);
      el.style.removeProperty('--mic-text-color');
      applyBackgroundVariables(el, null);
    });
  }
}

class TabHeaderRenderer {
  constructor(app, settings, styleIndex) {
    this.app = app;
    this.settings = settings;
    this.styleIndex = styleIndex;
    this.observer = null;
    this.scheduleRefresh = debounce(() => this.refresh(), 120);
  }

  setSettings(settings) {
    this.settings = settings;
  }

  start() {
    if (this.observer) return;

    this.observer = new MutationObserver(() => {
      if (this.settings.enableTabHeaders) this.scheduleRefresh();
    });

    this.observer.observe(document.body, { childList: true, subtree: true });
    this.refresh();
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.clearAll();
  }

  refresh() {
    if (!this.settings.enableTabHeaders) {
      this.clearAll();
      return;
    }

    const seenHeaders = new Set();

    if (typeof this.app.workspace.iterateAllLeaves !== 'function') {
      return;
    }

    this.app.workspace.iterateAllLeaves((leaf) => {
      const headerEl = this.getLeafHeaderEl(leaf);
      const file = this.getLeafFile(leaf);
      if (!headerEl || !file) return;

      seenHeaders.add(headerEl);
      this.applyToTabHeader(headerEl, file.path);
    });

    document.querySelectorAll('.workspace-tab-header').forEach((headerEl) => {
      if (!seenHeaders.has(headerEl) && headerEl.querySelector(`.${ICON_CLASS}.${TAB_HEADER_ICON_CLASS}`)) {
        this.clearHeader(headerEl);
      }
    });
  }

  getLeafFile(leaf) {
    const file = leaf && leaf.view ? leaf.view.file : null;
    return file instanceof TFile ? file : null;
  }

  getLeafHeaderEl(leaf) {
    const candidates = [
      leaf ? leaf.tabHeaderEl : null,
      leaf ? leaf.tabHeaderInnerEl : null,
      leaf ? leaf.tabHeaderInnerTitleEl : null,
    ];

    for (const candidate of candidates) {
      if (candidate instanceof HTMLElement) {
        return candidate.matches('.workspace-tab-header')
          ? candidate
          : candidate.closest('.workspace-tab-header');
      }
    }

    if (leaf && leaf === this.app.workspace.activeLeaf) {
      return document.querySelector('.workspace-tab-header.is-active');
    }

    return null;
  }

  applyToTabHeader(headerEl, path) {
    const titleEl = headerEl.querySelector('.workspace-tab-header-inner-title');
    const containerEl = titleEl ? titleEl.parentElement : headerEl.querySelector('.workspace-tab-header-inner');
    if (!titleEl || !containerEl) return;

    const style = this.styleIndex.getEffectiveStyleForPath(path);
    this.applyStyleVariables(titleEl, style);
    this.applyIcon(headerEl, containerEl, titleEl, style);
  }

  applyStyleVariables(titleEl, style) {
    if (style && style.textColor) {
      titleEl.classList.add(COLORED_TEXT_CLASS);
      titleEl.style.setProperty('--mic-text-color', style.textColor);
    } else {
      titleEl.classList.remove(COLORED_TEXT_CLASS);
      titleEl.style.removeProperty('--mic-text-color');
    }

    applyStyleBackgroundVariables(titleEl, style);
  }

  applyIcon(headerEl, containerEl, titleEl, style) {
    const existing = headerEl.querySelector(`:scope .${ICON_CLASS}.${TAB_HEADER_ICON_CLASS}`);

    if (!hasRenderableIcon(style)) {
      if (existing) existing.remove();
      return;
    }

    const iconSignature = getIconSignature(style);
    if (existing && existing.getAttribute('data-mic-icon-signature') === iconSignature) {
      existing.style.setProperty('--mic-icon-size', this.settings.fileExplorerIconSize);
      return;
    }

    const nextIcon = createIconElement(style, TAB_HEADER_ICON_CLASS, this.settings.fileExplorerIconSize);
    nextIcon.setAttribute('data-mic-icon-signature', iconSignature);

    if (existing) {
      existing.replaceWith(nextIcon);
    } else {
      containerEl.insertBefore(nextIcon, titleEl);
    }
  }

  clearHeader(headerEl) {
    headerEl.querySelectorAll(`.${ICON_CLASS}.${TAB_HEADER_ICON_CLASS}`).forEach((el) => el.remove());
    headerEl.querySelectorAll('.workspace-tab-header-inner-title').forEach((titleEl) => {
      titleEl.classList.remove(COLORED_TEXT_CLASS);
      titleEl.style.removeProperty('--mic-text-color');
      applyBackgroundVariables(titleEl, null);
    });
  }

  clearAll() {
    document.querySelectorAll('.workspace-tab-header').forEach((headerEl) => this.clearHeader(headerEl));
  }
}

class MarkdownLinkRenderer {
  constructor(app, settings, styleIndex) {
    this.app = app;
    this.settings = settings;
    this.styleIndex = styleIndex;
  }

  setSettings(settings) {
    this.settings = settings;
  }

  process(rootEl, sourcePath) {
    processShortenedRenderedElements(rootEl, this.settings);

    if (!this.settings.enableReadingViewLinks) return;

    rootEl.querySelectorAll('a.internal-link').forEach((linkEl) => {
      this.applyToInternalLink(linkEl, sourcePath);
    });

    rootEl.querySelectorAll('a.external-link[href], a[href]').forEach((linkEl) => {
      this.applyToExternalLink(linkEl);
    });
  }

  refreshOpenReadingViews() {
    if (!this.settings.enableReadingViewLinks) {
      this.clearAll(document.body);
    }

    this.app.workspace.getLeavesOfType('markdown').forEach((leaf) => {
      const view = leaf.view;
      if (!(view instanceof MarkdownView) || view.getMode() !== 'preview' || !view.file) return;
      this.process(view.contentEl, view.file.path);
    });
  }

  applyToInternalLink(linkEl, sourcePath) {
    const linkpath = this.getLinkpath(linkEl);
    if (!linkpath) return;

    const targetFile = this.app.metadataCache.getFirstLinkpathDest(linkpath, sourcePath);
    const targetPath = targetFile ? targetFile.path : linkpath;
    const style = this.styleIndex.getEffectiveStyleForPath(targetPath);

    linkEl.setAttribute('data-mic-internal-link', 'true');
    this.applyStyleVariables(linkEl, style);
    this.applyIcon(linkEl, style);
  }

  applyToExternalLink(linkEl) {
    if (linkEl.classList.contains('internal-link')) return;

    const href = this.getExternalUrl(linkEl);
    if (!href) return;

    const style = this.styleIndex.getEffectiveStyleForExternalUrl(href);
    if (style) {
      linkEl.setAttribute('data-mic-external-link', 'true');
    } else {
      linkEl.removeAttribute('data-mic-external-link');
    }
    this.markExternalLinkContainer(linkEl, Boolean(style));
    this.applyStyleVariables(linkEl, style);
    this.applyIcon(linkEl, style);
  }

  applyToPropertyValue(valueEl, propertyName, valueText) {
    const value = normalizePropertyValue(valueText);
    if (!value) {
      this.clearPropertyValue(valueEl);
      return;
    }

    const style = this.styleIndex.getEffectiveStyleForPropertyValue(propertyName, value);
    const targetEl = style ? ensurePropertyValueTargetElement(valueEl) : valueEl;
    if (style) {
      if (targetEl !== valueEl) this.clearPropertyDecoration(valueEl);
      targetEl.setAttribute(PROPERTY_VALUE_ATTR, 'true');
      targetEl.setAttribute('data-mic-property-name', propertyName || '');
      targetEl.setAttribute('data-mic-property-raw-value', value);
    } else {
      this.clearPropertyValue(valueEl);
    }

    this.applyStyleVariables(targetEl, style);
    this.applyIcon(targetEl, style);
  }

  clearPropertyDecoration(valueEl) {
    valueEl.removeAttribute(PROPERTY_VALUE_ATTR);
    valueEl.removeAttribute('data-mic-property-name');
    valueEl.removeAttribute('data-mic-property-raw-value');
    valueEl.classList.remove(COLORED_TEXT_CLASS);
    valueEl.style.removeProperty('--mic-text-color');
    applyBackgroundVariables(valueEl, null);

    const existing = valueEl.querySelector(`:scope > .${ICON_CLASS}.${LINK_ICON_CLASS}`);
    if (existing) existing.remove();
  }

  clearPropertyValue(valueEl) {
    const shouldUnwrap = valueEl.getAttribute(PROPERTY_VALUE_WRAPPER_ATTR) === 'true';

    if (isTableLikePropertyValueElement(valueEl)) {
      clearPropertyValueWrapperInCell(valueEl);
    }

    valueEl.removeAttribute(PROPERTY_VALUE_WRAPPER_ATTR);
    this.clearPropertyDecoration(valueEl);
    valueEl.querySelectorAll(`[${PROPERTY_VALUE_ATTR}="true"]`).forEach((styledEl) => {
      if (styledEl instanceof HTMLElement) this.clearPropertyDecoration(styledEl);
    });

    if (shouldUnwrap) unwrapPropertyValueWrapper(valueEl);
  }

  markExternalLinkContainer(linkEl, active) {
    const containerEl = linkEl.closest('.metadata-property-value, .metadata-property-value-container, .metadata-property');
    if (!containerEl) return;

    if (active) {
      containerEl.setAttribute('data-mic-external-link-container', 'true');
      return;
    }

    if (!containerEl.querySelector('[data-mic-external-link="true"]')) {
      containerEl.removeAttribute('data-mic-external-link-container');
    }
  }

  getExternalUrl(linkEl) {
    const directAttributes = ['href', 'data-href', 'data-url'];
    for (const attr of directAttributes) {
      const value = linkEl.getAttribute(attr);
      if (value) return value.trim();
    }

    const fallbackAttributes = ['aria-label', 'title'];
    for (const attr of fallbackAttributes) {
      const value = this.extractExternalUrl(linkEl.getAttribute(attr));
      if (value) return value;
    }

    return this.extractExternalUrl(linkEl.textContent);
  }

  extractExternalUrl(value) {
    if (!value) return null;

    const text = String(value).trim();
    const markdownLinkMatch = text.match(/\]\(([^)]+)\)/);
    if (markdownLinkMatch) return markdownLinkMatch[1].trim();

    const urlMatch = text.match(/\b(?:[a-z][a-z0-9+.-]*:\/\/|mailto:|tel:)[^\s)]+/i);
    return urlMatch ? urlMatch[0].trim() : null;
  }

  getLinkpath(linkEl) {
    const dataHref = linkEl.getAttribute('data-href');
    if (dataHref && !isExternalUrl(dataHref)) return dataHref;

    const href = linkEl.getAttribute('href');
    if (!href) return null;
    if (isExternalUrl(href)) return null;

    const decoded = decodeURIComponent(href);
    return decoded.replace(/^\.\//, '').replace(/\.md(#.*)?$/, '');
  }

  applyStyleVariables(linkEl, style) {
    if (style && style.textColor) {
      linkEl.classList.add(COLORED_TEXT_CLASS);
      linkEl.style.setProperty('--mic-text-color', style.textColor);
    } else {
      linkEl.classList.remove(COLORED_TEXT_CLASS);
      linkEl.style.removeProperty('--mic-text-color');
    }

    applyStyleBackgroundVariables(linkEl, style);
  }

  applyIcon(linkEl, style) {
    const existing = linkEl.querySelector(`:scope > .${ICON_CLASS}.${LINK_ICON_CLASS}`);

    if (!hasRenderableIcon(style)) {
      if (existing) existing.remove();
      return;
    }

    const iconSignature = getIconSignature(style);
    if (existing && existing.getAttribute('data-mic-icon-signature') === iconSignature) {
      existing.style.setProperty('--mic-icon-size', this.settings.linkIconSize);
      return;
    }

    const nextIcon = createIconElement(style, LINK_ICON_CLASS, this.settings.linkIconSize);
    nextIcon.setAttribute('data-mic-icon-signature', iconSignature);

    if (existing) {
      existing.replaceWith(nextIcon);
    } else {
      linkEl.prepend(nextIcon);
    }
  }

  clearAll(rootEl) {
    rootEl.querySelectorAll(`.${ICON_CLASS}.${LINK_ICON_CLASS}`).forEach((el) => el.remove());
    rootEl.querySelectorAll('.internal-link, [data-mic-external-link="true"]').forEach((el) => {
      el.classList.remove(COLORED_TEXT_CLASS);
      el.style.removeProperty('--mic-text-color');
      applyBackgroundVariables(el, null);
      el.removeAttribute('data-mic-internal-link');
      el.removeAttribute('data-mic-external-link');
    });
    rootEl.querySelectorAll('[data-mic-external-link-container="true"]').forEach((el) => {
      el.removeAttribute('data-mic-external-link-container');
    });
    rootEl.querySelectorAll(`[${PROPERTY_VALUE_ATTR}="true"]`).forEach((el) => {
      this.clearPropertyValue(el);
    });
  }
}

class GenericInternalLinkRenderer {
  constructor(app, settings, markdownLinkRenderer) {
    this.app = app;
    this.settings = settings;
    this.markdownLinkRenderer = markdownLinkRenderer;
    this.observer = null;
    this.scheduleRefresh = debounce(() => this.refresh(), 160);
  }

  setSettings(settings) {
    this.settings = settings;
  }

  start() {
    if (this.observer) return;

    this.observer = new MutationObserver(() => {
      if (this.settings.enableGenericInternalLinks || this.settings.enablePropertyValues) this.scheduleRefresh();
    });

    this.observer.observe(document.body, { childList: true, subtree: true });
    this.refresh();
  }

  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.clearAll();
  }

  refresh() {
    if (!this.settings.enableGenericInternalLinks && !this.settings.enablePropertyValues) {
      this.clearAll();
      return;
    }

    const sourcePath = this.app.workspace.getActiveFile() ? this.app.workspace.getActiveFile().path : '';

    if (this.settings.enableGenericInternalLinks) {
      this.getInternalLinkCandidates().forEach((linkEl) => {
        if (this.settings.enableShortenInternalLinks) shortenRenderedInternalLink(linkEl);
        this.markdownLinkRenderer.applyToInternalLink(linkEl, sourcePath);
      });

      document.querySelectorAll('a.external-link[href], a[href], [data-href], [data-url], .metadata-container [aria-label], .metadata-container [title], .metadata-properties [aria-label], .metadata-properties [title]').forEach((linkEl) => {
        this.markdownLinkRenderer.applyToExternalLink(linkEl);
      });
    }

    if (this.settings.enablePropertyValues) {
      this.getPropertyValueCandidates().forEach(({ element, propertyName, value }) => {
        this.markdownLinkRenderer.applyToPropertyValue(element, propertyName, value);
      });
    } else {
      this.clearPropertyValues();
    }
  }

  getInternalLinkCandidates() {
    const selectors = [
      '.internal-link',
      '.metadata-container [data-href]',
      '.metadata-properties [data-href]',
      '.metadata-property [data-href]',
    ];

    return [...new Set([...document.querySelectorAll(selectors.join(', '))])]
      .filter((linkEl) => this.markdownLinkRenderer.getLinkpath(linkEl));
  }

  getPropertyValueCandidates() {
    const candidates = [];

    document.querySelectorAll('.metadata-property').forEach((propertyEl) => {
      const propertyName = this.getMetadataPropertyName(propertyEl);
      const valueSelectors = [
        '.metadata-property-value .multi-select-pill-content',
        '.metadata-property-value .multi-select-pill',
        '.metadata-property-value .metadata-link',
        '.metadata-property-value a.internal-link',
        '.metadata-property-value a.external-link',
        '.metadata-property-value [data-href]',
        '.metadata-property-value .metadata-property-value-text',
        '.metadata-property-value .metadata-property-value-pill',
        '.metadata-property-value span:not(.metadata-property-icon):not(.metadata-property-warning-icon)',
      ];

      propertyEl.querySelectorAll(valueSelectors.join(', ')).forEach((element) => {
        if (!(element instanceof HTMLElement) || !this.isPropertyValueElement(element)) return;
        const value = this.extractPropertyValueText(element);
        if (value) candidates.push({ element, propertyName, value });
      });
    });

    const baseRoots = [
      '.workspace-leaf-content[data-type="base"]',
      '.workspace-leaf-content[data-type="bases"]',
      '.workspace-leaf-content[data-type="base-view"]',
      '.workspace-leaf-content[data-type="bases-view"]',
      '.base-embed',
      '.bases-embed',
      '.base-view',
      '.bases-view',
    ];
    const explicitBaseRootSelector = baseRoots.join(', ');
    const baseSelectors = baseRoots.flatMap((root) => [
      `${root} [data-property-value]`,
      `${root} [data-value]`,
      `${root} .table-cell-wrapper`,
      `${root} .multi-select-pill`,
      `${root} .multi-select-pill-content`,
      `${root} .metadata-property-value-pill`,
      `${root} .metadata-property-value-text`,
      `${root} [data-property-key]`,
      `${root} [data-property]`,
      `${root} [data-property-name]`,
      `${root} [data-field]`,
      `${root} [data-field-name]`,
      `${root} [data-column-key]`,
      `${root} [role="gridcell"]`,
      `${root} [role="cell"]`,
      `${root} td`,
      `${root} .base-table-cell`,
      `${root} .table-cell`,
      `${root} .bases-table-cell`,
      `${root} .base-td`,
      `${root} .bases-td`,
      `${root} .base-cell`,
      `${root} .bases-cell`,
    ]);
    const genericTableSelectors = [
      '.workspace-leaf-content [data-property-value]',
      '.workspace-leaf-content [data-value]',
      '.workspace-leaf-content .table-cell-wrapper',
      '.workspace-leaf-content .multi-select-pill-content',
      '.workspace-leaf-content [data-property-key]',
      '.workspace-leaf-content [data-property]',
      '.workspace-leaf-content [data-property-name]',
      '.workspace-leaf-content [data-field]',
      '.workspace-leaf-content [data-field-name]',
      '.workspace-leaf-content [data-column-key]',
      '.workspace-leaf-content [role="gridcell"]',
      '.workspace-leaf-content [role="cell"]',
      '.workspace-leaf-content td',
      '.workspace-leaf-content .base-table-cell',
      '.workspace-leaf-content .table-cell',
      '.workspace-leaf-content .bases-table-cell',
      '.workspace-leaf-content .base-td',
      '.workspace-leaf-content .bases-td',
      '.workspace-leaf-content .base-cell',
      '.workspace-leaf-content .bases-cell',
    ];

    document.querySelectorAll([...baseSelectors, ...genericTableSelectors].join(', ')).forEach((element) => {
      const isExplicitBaseElement = Boolean(element.closest(explicitBaseRootSelector));
      if (!isExplicitBaseElement && element.closest('.markdown-preview-view, .markdown-source-view')) return;
      if (element.closest('.metadata-property')) return;
      if (!(element instanceof HTMLElement) || !this.isPropertyValueElement(element)) return;
      const value = this.extractPropertyValueText(element);
      if (!value) return;
      candidates.push({
        element,
        propertyName: this.getPropertyNameFromContext(element),
        value,
      });
    });

    return this.filterLeafPropertyValueCandidates(candidates);
  }

  filterLeafPropertyValueCandidates(candidates) {
    const seen = new Set();
    const unique = candidates.filter(({ element, propertyName, value }) => {
      if (!propertyName || !value) return false;
      if (seen.has(element)) return false;
      seen.add(element);
      return true;
    });

    unique.sort((a, b) => getElementDepth(b.element) - getElementDepth(a.element));

    const accepted = [];
    for (const candidate of unique) {
      const hasAcceptedChild = accepted.some(({ element }) => candidate.element.contains(element));
      if (hasAcceptedChild) continue;
      accepted.push(candidate);
    }

    return accepted;
  }

  isPropertyValueElement(element) {
    if (element.matches('input, textarea, select, button, svg, path')) return false;
    if (element.matches('th, [role="columnheader"], .bases-table-header-name, .base-table-header-cell, .bases-table-header-cell, .base-th, .bases-th, .table-header-cell')) return false;
    if (element.matches('a, [data-href], [data-url], .internal-link, .external-link, .metadata-link')) return false;
    if (element.closest('.modal, .suggestion-container, .menu, .prompt, .nav-files-container')) return false;
    if (element.classList.contains(ICON_CLASS)) return false;
    if (element.closest(`.${ICON_CLASS}`)) return false;
    const styledParent = element.parentElement ? element.parentElement.closest(`[${PROPERTY_VALUE_ATTR}="true"]`) : null;
    if (styledParent) return false;
    const preferredParent = element.parentElement
      ? element.parentElement.closest([
        '.metadata-property-value .multi-select-pill',
        '.metadata-property-value .metadata-link',
        '.metadata-property-value a.internal-link',
        '.metadata-property-value a.external-link',
        '.metadata-property-value [data-href]',
      ].join(', '))
      : null;
    if (preferredParent && preferredParent !== element) return false;
    if (element.matches('.metadata-property-key, .metadata-property-key-input, .metadata-property-icon')) return false;
    return Boolean(this.extractPropertyValueText(element));
  }

  getMetadataPropertyName(propertyEl) {
    const attrNames = ['data-property-key', 'data-property', 'data-field', 'data-name'];
    for (const attrName of attrNames) {
      const value = propertyEl.getAttribute(attrName);
      if (value) return normalizePropertyName(value);
    }

    const keyEl = propertyEl.querySelector('.metadata-property-key-input, .metadata-property-key, [data-property-key]');
    return keyEl ? normalizePropertyName(this.extractPropertyValueText(keyEl)) : '';
  }

  getPropertyNameFromContext(element) {
    const tablePropertyName = this.getPropertyNameFromTableStructure(element);
    if (tablePropertyName) return tablePropertyName;

    const attrNames = [
      'data-property-key',
      'data-property',
      'data-property-name',
      'data-field',
      'data-field-name',
      'data-column-key',
      'data-column-name',
      'data-column',
      'data-name',
    ];
    let current = element;
    while (current && current instanceof HTMLElement && current !== document.body) {
      for (const attrName of attrNames) {
        const value = current.getAttribute(attrName);
        if (value) return normalizePropertyHeaderText(value);
      }
      current = current.parentElement;
    }
    return '';
  }

  getPropertyNameFromTableStructure(element) {
    const cell = this.getBaseCellElement(element);
    if (!cell) return '';

    const directName = this.getPropertyNameFromElementAttributes(cell);
    if (directName) return directName;

    const root = cell.closest('table, [role="grid"], .base-table, .bases-table, .base-view, .bases-view, .base-embed, .bases-embed, .workspace-leaf-content');
    if (!root) return '';

    const headerSelectors = [
      'thead th',
      '[role="columnheader"]',
      '.bases-table-header-name',
      '.base-table-header-cell',
      '.bases-table-header-cell',
      '.base-th',
      '.bases-th',
      '.table-header-cell',
      '.table-view-th',
    ];
    const headers = [...root.querySelectorAll(headerSelectors.join(', '))]
      .filter((header) => header instanceof HTMLElement);

    const headerByGeometry = this.getHeaderByGeometry(cell, headers);
    if (headerByGeometry) return normalizePropertyHeaderText(this.extractPropertyValueText(headerByGeometry));

    const columnIndex = this.getColumnIndex(cell);
    const headerByIndex = columnIndex >= 0
      ? headers.find((headerEl) => this.getColumnIndex(headerEl) === columnIndex) || headers[columnIndex]
      : null;
    return headerByIndex ? normalizePropertyHeaderText(this.extractPropertyValueText(headerByIndex)) : '';
  }

  getHeaderByGeometry(cell, headers) {
    if (!headers.length) return null;

    const cellRect = cell.getBoundingClientRect();
    if (!cellRect.width && !cellRect.height) return null;

    const cellCenterX = cellRect.left + cellRect.width / 2;
    let bestHeader = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    headers.forEach((header) => {
      const headerRect = header.getBoundingClientRect();
      if (!headerRect.width && !headerRect.height) return;

      const containsCenter = headerRect.left <= cellCenterX && cellCenterX <= headerRect.right;
      const headerCenterX = headerRect.left + headerRect.width / 2;
      const distance = containsCenter ? 0 : Math.abs(headerCenterX - cellCenterX);

      if (distance < bestDistance) {
        bestHeader = header;
        bestDistance = distance;
      }
    });

    return bestHeader;
  }

  getPropertyNameFromElementAttributes(element) {
    const attrNames = [
      'data-property-key',
      'data-property',
      'data-property-name',
      'data-field',
      'data-field-name',
      'data-column-key',
      'data-column-name',
      'data-column',
      'data-name',
    ];

    for (const attrName of attrNames) {
      const value = element.getAttribute(attrName);
      if (!value) continue;
      const normalized = normalizePropertyHeaderText(value.split(':')[0]);
      if (normalized) return normalized;
    }

    return '';
  }

  getBaseCellElement(element) {
    const selector = [
      'td',
      '[role="gridcell"]',
      '[role="cell"]',
      '.table-cell-wrapper',
      '.base-table-cell',
      '.table-cell',
      '.bases-table-cell',
      '.base-td',
      '.bases-td',
      '.base-cell',
      '.bases-cell',
      '[data-cell]',
      '[data-cell-id]',
    ].join(', ');
    return element.matches(selector) ? element : element.closest(selector);
  }

  getColumnIndex(element) {
    if (typeof element.cellIndex === 'number' && element.cellIndex >= 0) return element.cellIndex;

    const attrNames = ['aria-colindex', 'data-colindex', 'data-column-index', 'data-col', 'data-index'];
    for (const attrName of attrNames) {
      const rawValue = element.getAttribute(attrName);
      if (!rawValue) continue;
      const numberValue = Number.parseInt(rawValue, 10);
      if (Number.isFinite(numberValue)) {
        return attrName === 'aria-colindex' ? numberValue - 1 : numberValue;
      }
    }

    const parent = element.parentElement;
    if (!parent) return -1;
    return [...parent.children].filter((child) => child instanceof HTMLElement).indexOf(element);
  }

  extractPropertyValueText(element) {
    if (!element) return '';
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return normalizeRenderedPropertyValue(element.value);
    }

    const clone = element.cloneNode(true);
    if (!(clone instanceof HTMLElement)) return normalizeRenderedPropertyValue(element.textContent);

    clone.querySelectorAll([
      `.${ICON_CLASS}`,
      '.multi-select-pill-remove-button',
      '.metadata-property-value-remove',
      '.metadata-link-flair',
      '.metadata-link-icon',
      '.metadata-property-value-external-link',
      '.metadata-property-icon',
      '.metadata-property-warning-icon',
      '.clickable-icon',
      'svg',
    ].join(', ')).forEach((child) => child.remove());

    return normalizeRenderedPropertyValue(clone.textContent);
  }

  clearPropertyValues() {
    document.querySelectorAll(`[${PROPERTY_VALUE_ATTR}="true"]`).forEach((el) => {
      if (el.closest('.markdown-preview-view')) return;
      this.markdownLinkRenderer.clearPropertyValue(el);
    });
  }

  clearAll() {
    document.querySelectorAll(`.${ICON_CLASS}.${LINK_ICON_CLASS}`).forEach((el) => {
      if (!el.closest('.markdown-preview-view')) el.remove();
    });
    document.querySelectorAll('.internal-link, [data-mic-external-link="true"]').forEach((el) => {
      if (el.closest('.markdown-preview-view')) return;
      el.classList.remove(COLORED_TEXT_CLASS);
      el.style.removeProperty('--mic-text-color');
      el.removeAttribute('data-mic-internal-link');
      el.removeAttribute('data-mic-external-link');
    });
    document.querySelectorAll('[data-mic-external-link-container="true"]').forEach((el) => {
      if (el.closest('.markdown-preview-view')) return;
      el.removeAttribute('data-mic-external-link-container');
    });
    this.clearPropertyValues();
  }
}

function renderDiagnosticsTable(containerEl, rows) {
  const table = containerEl.createEl('table', { cls: 'mic-diagnostics-table' });
  const header = table.createEl('thead').createEl('tr');
  const columns = [
    'path',
    'type',
    'matchedRule',
    'icon',
    'resolvedIconPath',
    'iconColorMode',
    'iconColor',
    'textColor',
    'backgroundColor',
    'fillBackground',
    'inherited',
    'reason',
  ];

  columns.forEach((column) => header.createEl('th', { text: column }));

  const body = table.createEl('tbody');
  rows.forEach((row) => {
    const tr = body.createEl('tr');
    columns.forEach((column) => {
      tr.createEl('td', { text: row[column] === undefined || row[column] === null ? '' : String(row[column]) });
    });
  });
}

class MatchedPathsModal extends Modal {
  constructor(app, rows, title) {
    super(app);
    this.rows = rows;
    this.title = title;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('mic-diagnostics-modal');
    contentEl.createEl('h2', { text: this.title });

    if (!this.rows.length) {
      contentEl.createDiv({ cls: 'setting-item-description', text: 'Нет данных для отображения.' });
      return;
    }

    renderDiagnosticsTable(contentEl, this.rows);
  }
}

class ValidationReportModal extends Modal {
  constructor(app, report) {
    super(app);
    this.report = report;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('mic-diagnostics-modal');
    contentEl.createEl('h2', { text: 'Проверка правил и иконок' });

    const summary = contentEl.createDiv({ cls: 'mic-validation-summary' });
    [
      ['Rules', this.report.ruleCount],
      ['Resolved icons', this.report.resolvedIconCount],
      ['Missing icons', this.report.missingIcons.length],
      ['Rules without matches', this.report.rulesWithoutMatches.length],
      ['Duplicate paths', this.report.duplicateRules.length],
    ].forEach(([label, value]) => {
      const item = summary.createDiv({ cls: 'mic-validation-summary-item' });
      item.createSpan({ cls: 'mic-validation-summary-label', text: label });
      item.createSpan({ cls: 'mic-validation-summary-value', text: String(value) });
    });

    this.renderList(contentEl, 'Missing icons', this.report.missingIcons, (item) => {
      const wrapper = document.createElement('div');
      const title = document.createElement('div');
      title.textContent = `${item.icon} — ${item.rule}`;
      wrapper.appendChild(title);
      const tried = document.createElement('ul');
      item.triedPaths.forEach((path) => {
        const li = document.createElement('li');
        li.textContent = path;
        tried.appendChild(li);
      });
      wrapper.appendChild(tried);
      return wrapper;
    });

    this.renderList(contentEl, 'Rules without matches', this.report.rulesWithoutMatches, (item) => {
      const wrapper = document.createElement('div');
      wrapper.textContent = `${item.type}: ${item.path}`;
      return wrapper;
    });

    this.renderList(contentEl, 'Duplicate paths', this.report.duplicateRules, (item) => {
      const wrapper = document.createElement('div');
      wrapper.textContent = `${item.key} (${item.count})`;
      return wrapper;
    });
  }

  renderList(containerEl, title, items, renderItem) {
    const section = containerEl.createDiv({ cls: 'mic-validation-section' });
    section.createEl('h3', { text: title });

    if (!items.length) {
      section.createDiv({ cls: 'setting-item-description', text: 'Нет проблем.' });
      return;
    }

    const list = section.createEl('ul');
    items.forEach((item) => {
      const li = list.createEl('li');
      li.appendChild(renderItem(item));
    });
  }
}

class VaultPathSuggest {
  constructor(app, inputEl, getType, onSelect) {
    this.app = app;
    this.inputEl = inputEl;
    this.getType = getType;
    this.onSelect = onSelect;
    this.highlightedIndex = 0;
    this.suggestions = [];
    this.isOpen = false;
    this.suggestionEl = document.createElement('div');
    this.suggestionEl.classList.add('suggestion-container', 'mic-suggestion-popover');
    this.suggestionListEl = this.suggestionEl.createDiv({ cls: 'suggestion' });
    this.suggestionListEl.setAttribute('role', 'listbox');
    this.suggestionListEl.setAttribute('aria-label', 'Path suggestions');
    this.onInput = () => this.render();
    this.onFocus = () => this.render();
    this.onKeydown = (event) => this.handleKeydown(event);
    this.onBlur = () => this.close();
    this.onDocumentPointerDown = (event) => {
      if (!this.isOpen) return;
      if (this.inputEl.contains(event.target) || this.suggestionEl.contains(event.target)) return;
      this.close();
    };
    this.onWindowResize = () => this.close();

    this.inputEl.setAttribute('aria-autocomplete', 'list');
    this.inputEl.setAttribute('aria-expanded', 'false');
    this.suggestionEl.addEventListener('mousedown', (event) => event.preventDefault());

    this.inputEl.addEventListener('input', this.onInput);
    this.inputEl.addEventListener('focus', this.onFocus);
    this.inputEl.addEventListener('keydown', this.onKeydown);
    this.inputEl.addEventListener('blur', this.onBlur);
    document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    window.addEventListener('resize', this.onWindowResize);
  }

  getSuggestions(query) {
    const normalizedQuery = normalizeVaultPath(query).toLowerCase();
    const type = this.getType();
    const files = this.app.vault.getAllLoadedFiles()
      .filter((file) => (type === 'folder' ? file instanceof TFolder : file instanceof TFile))
      .map((file) => file.path)
      .filter((path) => path && path.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => a.localeCompare(b));

    return files.slice(0, 50);
  }

  renderSuggestion(path, el) {
    el.setText(path);
  }

  render() {
    this.suggestions = this.getSuggestions(this.inputEl.value);
    this.highlightedIndex = Math.min(this.highlightedIndex, Math.max(0, this.suggestions.length - 1));

    this.suggestionListEl.empty();
    if (!this.suggestions.length) {
      this.close();
      return;
    }

    this.suggestions.forEach((path, index) => {
      const itemEl = this.suggestionListEl.createDiv({ cls: 'suggestion-item mic-path-suggestion-option' });
      itemEl.setAttribute('role', 'option');
      itemEl.setAttribute('aria-selected', index === this.highlightedIndex ? 'true' : 'false');
      if (index === this.highlightedIndex) itemEl.addClass('is-selected');
      this.renderSuggestion(path, itemEl);

      const selectPath = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.selectSuggestion(path);
      };
      itemEl.addEventListener('pointerdown', selectPath);
      itemEl.addEventListener('mousedown', selectPath);
      itemEl.addEventListener('click', selectPath);
    });

    this.isOpen = true;
    this.inputEl.setAttribute('aria-expanded', 'true');
    this.open();
  }

  handleKeydown(event) {
    const wasOpen = this.isOpen;
    if (!wasOpen && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
      this.render();
      if (event.key !== 'Enter') {
        event.preventDefault();
        return;
      }
    }

    if (!this.isOpen) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.highlightedIndex = Math.min(this.highlightedIndex + 1, this.suggestions.length - 1);
      this.render();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.highlightedIndex = Math.max(this.highlightedIndex - 1, 0);
      this.render();
      return;
    }

    if (event.key === 'Enter') {
      const path = this.suggestions[this.highlightedIndex] || this.suggestions[0];
      if (!path) return;
      event.preventDefault();
      this.selectSuggestion(path);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }

  selectSuggestion(path) {
    if (!this.isOpen) return;
    this.inputEl.value = path;
    this.onSelect(path);
    this.close();
  }

  open() {
    if (!this.suggestionEl.isConnected) {
      this.inputEl.ownerDocument.body.appendChild(this.suggestionEl);
    }

    const rect = this.inputEl.getBoundingClientRect();
    this.suggestionEl.style.left = `${rect.left}px`;
    this.suggestionEl.style.top = `${rect.bottom + 4}px`;
    this.suggestionEl.style.width = `${rect.width}px`;
    this.suggestionEl.style.display = 'block';
  }

  close() {
    this.isOpen = false;
    this.inputEl.setAttribute('aria-expanded', 'false');
    this.suggestionEl.remove();
  }

  destroy() {
    this.inputEl.removeEventListener('input', this.onInput);
    this.inputEl.removeEventListener('focus', this.onFocus);
    this.inputEl.removeEventListener('keydown', this.onKeydown);
    this.inputEl.removeEventListener('blur', this.onBlur);
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    window.removeEventListener('resize', this.onWindowResize);
    this.suggestionEl.remove();
  }
}

class IconNameSuggest {
  constructor(app, inputEl, plugin, onSelect) {
    this.app = app;
    this.inputEl = inputEl;
    this.plugin = plugin;
    this.onSelect = onSelect;
    this.highlightedIndex = 0;
    this.suggestions = [];
    this.isOpen = false;
    this.suggestionEl = document.createElement('div');
    this.suggestionEl.classList.add('suggestion-container', 'mic-suggestion-popover');
    this.suggestionListEl = this.suggestionEl.createDiv({ cls: 'suggestion' });
    this.suggestionListEl.setAttribute('role', 'listbox');
    this.suggestionListEl.setAttribute('aria-label', 'Icon suggestions');
    this.onInput = () => this.render();
    this.onFocus = () => this.render();
    this.onKeydown = (event) => this.handleKeydown(event);
    this.onBlur = () => this.close();
    this.onDocumentPointerDown = (event) => {
      if (!this.isOpen) return;
      if (this.inputEl.contains(event.target) || this.suggestionEl.contains(event.target)) return;
      this.close();
    };
    this.onWindowResize = () => this.close();

    this.inputEl.setAttribute('aria-autocomplete', 'list');
    this.inputEl.setAttribute('aria-expanded', 'false');
    this.suggestionEl.addEventListener('mousedown', (event) => event.preventDefault());

    this.inputEl.addEventListener('input', this.onInput);
    this.inputEl.addEventListener('focus', this.onFocus);
    this.inputEl.addEventListener('keydown', this.onKeydown);
    this.inputEl.addEventListener('blur', this.onBlur);
    document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    window.addEventListener('resize', this.onWindowResize);
  }

  getSuggestions(query) {
    const normalizedQuery = String(query || '').toLowerCase();
    const iconSearchPaths = new Set((this.plugin.settings.iconSearchPaths || []).map((path) => normalizeVaultPath(path)));
    const iconNames = new Set();

    for (const file of this.app.vault.getFiles()) {
      const extension = getIconFileExtension(file.path);
      if (!ICON_FILE_EXTENSIONS.includes(extension)) continue;
      const parentPath = dirname(file.path);
      const parentName = folderName(parentPath);
      const parentParentPath = dirname(parentPath);
      const fileBaseName = basenameWithoutExtension(file.path);
      if (!iconSearchPaths.has(parentPath) && !(iconSearchPaths.has(parentParentPath) && parentName === fileBaseName)) continue;
      const iconName = file.name;
      if (!normalizedQuery || iconName.toLowerCase().includes(normalizedQuery)) {
        iconNames.add(iconName);
      }
    }

    return [...iconNames].sort((a, b) => a.localeCompare(b)).slice(0, 50);
  }

  render() {
    this.suggestions = this.getSuggestions(this.inputEl.value);
    this.highlightedIndex = Math.min(this.highlightedIndex, Math.max(0, this.suggestions.length - 1));

    this.suggestionListEl.empty();
    if (!this.suggestions.length) {
      this.close();
      return;
    }

    this.suggestions.forEach((iconName, index) => {
      const itemEl = this.suggestionListEl.createDiv({ cls: 'suggestion-item mic-icon-suggestion-option' });
      itemEl.setAttribute('role', 'option');
      itemEl.setAttribute('aria-selected', index === this.highlightedIndex ? 'true' : 'false');
      if (index === this.highlightedIndex) itemEl.addClass('is-selected');
      this.renderSuggestion(iconName, itemEl);

      const selectIcon = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.selectSuggestion(iconName);
      };
      itemEl.addEventListener('pointerdown', selectIcon);
      itemEl.addEventListener('mousedown', selectIcon);
      itemEl.addEventListener('click', selectIcon);
    });

    this.isOpen = true;
    this.inputEl.setAttribute('aria-expanded', 'true');
    this.open();
  }

  renderSuggestion(iconName, el) {
    el.addClass('mic-icon-suggestion');

    const iconSlot = el.createSpan({ cls: 'mic-icon-suggestion-preview' });
    el.createSpan({ cls: 'mic-icon-suggestion-label', text: iconName });

    this.plugin.iconResolver.resolveIcon(iconName).then((iconPath) => {
      if (!iconPath || !iconSlot.isConnected) return;

      iconSlot.empty();
      const image = iconSlot.createEl('img');
      image.src = iconPath;
      image.decoding = 'async';
      image.loading = 'lazy';
    });
  }

  handleKeydown(event) {
    const wasOpen = this.isOpen;
    if (!wasOpen && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
      this.render();
      if (event.key !== 'Enter') {
        event.preventDefault();
        return;
      }
    }

    if (!this.isOpen) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.highlightedIndex = Math.min(this.highlightedIndex + 1, this.suggestions.length - 1);
      this.render();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.highlightedIndex = Math.max(this.highlightedIndex - 1, 0);
      this.render();
      return;
    }

    if (event.key === 'Enter') {
      const iconName = this.suggestions[this.highlightedIndex] || this.suggestions[0];
      if (!iconName) return;
      event.preventDefault();
      this.selectSuggestion(iconName);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }

  selectSuggestion(iconName) {
    if (!this.isOpen) return;
    this.inputEl.value = iconName;
    this.onSelect(iconName);
    this.close();
  }

  open() {
    if (!this.suggestionEl.isConnected) {
      this.inputEl.ownerDocument.body.appendChild(this.suggestionEl);
    }

    const rect = this.inputEl.getBoundingClientRect();
    this.suggestionEl.style.left = `${rect.left}px`;
    this.suggestionEl.style.top = `${rect.bottom + 4}px`;
    this.suggestionEl.style.width = `${rect.width}px`;
    this.suggestionEl.style.display = 'block';
  }

  close() {
    this.isOpen = false;
    this.inputEl.setAttribute('aria-expanded', 'false');
    this.suggestionEl.remove();
  }

  destroy() {
    this.inputEl.removeEventListener('input', this.onInput);
    this.inputEl.removeEventListener('focus', this.onFocus);
    this.inputEl.removeEventListener('keydown', this.onKeydown);
    this.inputEl.removeEventListener('blur', this.onBlur);
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    window.removeEventListener('resize', this.onWindowResize);
    this.suggestionEl.remove();
  }
}

class TextValueSuggest {
  constructor(inputEl, getSuggestions, onSelect, ariaLabel) {
    this.inputEl = inputEl;
    this.getSuggestions = getSuggestions;
    this.onSelect = onSelect;
    this.highlightedIndex = 0;
    this.suggestions = [];
    this.isOpen = false;
    this.suggestionEl = document.createElement('div');
    this.suggestionEl.classList.add('suggestion-container', 'mic-suggestion-popover');
    this.suggestionListEl = this.suggestionEl.createDiv({ cls: 'suggestion' });
    this.suggestionListEl.setAttribute('role', 'listbox');
    this.suggestionListEl.setAttribute('aria-label', ariaLabel || 'Text suggestions');
    this.onInput = () => this.render();
    this.onFocus = () => this.render();
    this.onKeydown = (event) => this.handleKeydown(event);
    this.onBlur = () => window.setTimeout(() => this.close(), 80);
    this.onDocumentPointerDown = (event) => {
      if (!this.isOpen) return;
      if (this.inputEl.contains(event.target) || this.suggestionEl.contains(event.target)) return;
      this.close();
    };
    this.onWindowResize = () => this.close();

    this.inputEl.setAttribute('aria-autocomplete', 'list');
    this.inputEl.setAttribute('aria-expanded', 'false');
    this.suggestionEl.addEventListener('mousedown', (event) => event.preventDefault());

    this.inputEl.addEventListener('input', this.onInput);
    this.inputEl.addEventListener('focus', this.onFocus);
    this.inputEl.addEventListener('keydown', this.onKeydown);
    this.inputEl.addEventListener('blur', this.onBlur);
    document.addEventListener('pointerdown', this.onDocumentPointerDown, true);
    window.addEventListener('resize', this.onWindowResize);
  }

  render() {
    this.suggestions = this.getSuggestions(this.inputEl.value);
    this.highlightedIndex = Math.min(this.highlightedIndex, Math.max(0, this.suggestions.length - 1));

    this.suggestionListEl.empty();
    if (!this.suggestions.length) {
      this.close();
      return;
    }

    this.suggestions.forEach((value, index) => {
      const itemEl = this.suggestionListEl.createDiv({ cls: 'suggestion-item mic-path-suggestion-option' });
      itemEl.setAttribute('role', 'option');
      itemEl.setAttribute('aria-selected', index === this.highlightedIndex ? 'true' : 'false');
      if (index === this.highlightedIndex) itemEl.addClass('is-selected');
      itemEl.setText(value);

      const selectValue = (event) => {
        event.preventDefault();
        event.stopPropagation();
        this.selectSuggestion(value);
      };
      itemEl.addEventListener('pointerdown', selectValue);
      itemEl.addEventListener('mousedown', selectValue);
      itemEl.addEventListener('click', selectValue);
    });

    this.isOpen = true;
    this.inputEl.setAttribute('aria-expanded', 'true');
    this.open();
  }

  handleKeydown(event) {
    const wasOpen = this.isOpen;
    if (!wasOpen && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
      this.render();
      if (event.key !== 'Enter') {
        event.preventDefault();
        return;
      }
    }

    if (!this.isOpen) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.highlightedIndex = Math.min(this.highlightedIndex + 1, this.suggestions.length - 1);
      this.render();
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.highlightedIndex = Math.max(this.highlightedIndex - 1, 0);
      this.render();
      return;
    }

    if (event.key === 'Enter') {
      const value = this.suggestions[this.highlightedIndex] || this.suggestions[0];
      if (!value) return;
      event.preventDefault();
      this.selectSuggestion(value);
      return;
    }

    if (event.key === 'Escape') {
      event.preventDefault();
      this.close();
    }
  }

  selectSuggestion(value) {
    if (!this.isOpen) return;
    this.inputEl.value = value;
    this.onSelect(value);
    this.close();
  }

  open() {
    if (!this.suggestionEl.isConnected) {
      this.inputEl.ownerDocument.body.appendChild(this.suggestionEl);
    }

    const rect = this.inputEl.getBoundingClientRect();
    this.suggestionEl.style.left = `${rect.left}px`;
    this.suggestionEl.style.top = `${rect.bottom + 4}px`;
    this.suggestionEl.style.width = `${rect.width}px`;
    this.suggestionEl.style.display = 'block';
  }

  close() {
    this.isOpen = false;
    this.inputEl.setAttribute('aria-expanded', 'false');
    this.suggestionEl.remove();
  }

  destroy() {
    this.inputEl.removeEventListener('input', this.onInput);
    this.inputEl.removeEventListener('focus', this.onFocus);
    this.inputEl.removeEventListener('keydown', this.onKeydown);
    this.inputEl.removeEventListener('blur', this.onBlur);
    document.removeEventListener('pointerdown', this.onDocumentPointerDown, true);
    window.removeEventListener('resize', this.onWindowResize);
    this.suggestionEl.remove();
  }
}

class RuleEditModal extends Modal {
  constructor(app, plugin, rule, onSave, fixedType) {
    super(app);
    this.plugin = plugin;
    this.fixedType = fixedType || null;
    const defaultType = this.fixedType || 'folder';
    this.rule = cleanPathRule(rule || {
      type: defaultType,
      path: '',
      iconSource: 'svg',
      icon: '',
      textColor: '#FFFFFF',
      backgroundColor: '#FFFFFF',
      cascade: defaultType === 'folder',
    }, this.fixedType || undefined);
    this.onSave = onSave;
    this.activeSuggests = [];
  }

  onOpen() {
    this.render();
  }

  onClose() {
    this.destroySuggests();
  }

  destroySuggests() {
    this.activeSuggests.forEach((suggest) => suggest.destroy());
    this.activeSuggests = [];
  }

  getPathValues() {
    const values = getEditablePathRulePaths(this.rule);
    return values.length ? values : [''];
  }

  setPathValue(index, value) {
    const values = this.getPathValues();
    values[index] = normalizeVaultPath(value).trim();
    setEditablePathRulePaths(this.rule, values);
  }

  removePathValue(index) {
    const values = this.getPathValues().filter((_, valueIndex) => valueIndex !== index);
    setEditablePathRulePaths(this.rule, values.length ? values : ['']);
    this.render();
  }

  addPathValue() {
    const values = this.getPathValues();
    values.push('');
    setEditablePathRulePaths(this.rule, values);
    this.render();
  }

  renderPathInputs(contentEl) {
    const values = this.getPathValues();

    values.forEach((path, index) => {
      const setting = new Setting(contentEl)
        .setName(index === 0 ? 'Пути' : `Путь ${index + 1}`)
        .setDesc(index === 0
          ? 'Можно указать несколько папок или файлов, которые будут использовать один стиль.'
          : 'Дополнительный путь для этого же стиля.')
        .addText((text) => {
          text
            .setPlaceholder(this.rule.type === 'folder' ? 'Development/Golang' : 'main.md')
            .setValue(path || '')
            .onChange((value) => {
              this.setPathValue(index, value);
            });
          this.activeSuggests.push(new VaultPathSuggest(this.app, text.inputEl, () => normalizeRuleType(this.rule, this.rule.path), (selectedPath) => {
            this.setPathValue(index, selectedPath);
            text.setValue(selectedPath);
          }));
        });

      if (values.length > 1) {
        setting.addButton((button) => {
          button
            .setIcon('x')
            .setTooltip('Удалить путь')
            .onClick(() => this.removePathValue(index));
        });
      }
    });

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText('Добавить путь')
          .onClick(() => this.addPathValue());
      });
  }

  render() {
    this.destroySuggests();
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('mic-rule-modal');
    contentEl.createEl('h2', { text: 'Правило иконки и цвета' });

    if (!this.fixedType) {
      new Setting(contentEl)
        .setName('Тип')
        .setDesc('Папка может каскадно задавать стиль вложенным файлам. Файл применяется только к точному пути.')
        .addDropdown((dropdown) => {
          dropdown
            .addOption('folder', 'Папка')
            .addOption('file', 'Файл')
            .setValue(normalizeRuleType(this.rule, this.rule.path))
            .onChange((value) => {
              this.rule.type = value;
              if (value === 'file') delete this.rule.cascade;
              if (value === 'folder' && !Object.prototype.hasOwnProperty.call(this.rule, 'cascade')) {
                this.rule.cascade = true;
              }
              this.render();
            });
        });
    }

    this.renderPathInputs(contentEl);

    new Setting(contentEl)
      .setName('Источник иконки')
      .setDesc('Иконка ищется в папках поиска. Emoji / текст вставляется как есть.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('svg', 'Иконка из папки')
          .addOption('text', 'Emoji / текст')
          .setValue(normalizeIconSource(this.rule))
          .onChange((value) => {
            this.rule.iconSource = value;
            this.render();
          });
      });

    const iconSource = normalizeIconSource(this.rule);

    new Setting(contentEl)
      .setName(iconSource === 'text' ? 'Emoji / текст' : 'Иконка')
      .setDesc(iconSource === 'text'
        ? 'Можно вставить emoji или любой короткий текст.'
        : 'Имя файла иконки из папок поиска, например golang.svg. Без расширения по старой совместимости ищется .svg. Можно указать путь до файла.')
      .addText((text) => {
        text
          .setPlaceholder(iconSource === 'text' ? '🔥' : 'golang.svg')
          .setValue(this.rule.icon || '')
          .onChange((value) => {
            this.rule.icon = value.trim();
          });
        if (iconSource === 'svg') {
          this.activeSuggests.push(new IconNameSuggest(this.app, text.inputEl, this.plugin, (iconName) => {
            this.rule.icon = iconName;
          }));
        }
      });

    addIconColorSettings(contentEl, this.rule, () => this.render());

    addHexColorSetting(contentEl, {
      name: 'Цвет текста',
      desc: 'Цвет применяется к названию файла/папки и внутренним ссылкам.',
      rule: this.rule,
      property: 'textColor',
      fallback: '#FFFFFF',
    });

    const backgroundSetting = addHexColorSetting(contentEl, {
      name: 'Цвет фона',
      desc: 'Цвет фона плашки. Прозрачность задается общей настройкой плагина.',
      rule: this.rule,
      property: 'backgroundColor',
      fallback: this.rule.textColor || '#FFFFFF',
    });
    backgroundSetting.controlEl.createSpan({ cls: 'mic-setting-inline-label', text: 'Заливать фон' });
    backgroundSetting.addToggle((toggle) => {
      toggle
        .setValue(this.rule.fillBackground !== false)
        .onChange((value) => {
          setRuleFillBackground(this.rule, value);
        });
    });

    if (normalizeRuleType(this.rule, this.rule.path) === 'folder') {
      new Setting(contentEl)
        .setName('Каскадно применять к вложенным файлам')
        .setDesc('Ближайшее вложенное правило переопределит родительское.')
        .addToggle((toggle) => {
          toggle
            .setValue(Boolean(this.rule.cascade))
            .onChange((value) => {
              this.rule.cascade = value;
            });
        });
    }

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText('Сохранить')
          .setCta()
          .onClick(async () => {
            const nextRule = cleanPathRule(this.rule, this.fixedType || undefined);
            if (!nextRule.path) {
              new Notice('Vault Badge Styles: укажи путь');
              return;
            }
            await this.onSave(nextRule);
            this.close();
          });
      })
      .addButton((button) => {
        button
          .setButtonText('Отмена')
          .onClick(() => this.close());
      });
  }
}

class ExternalLinkRuleEditModal extends Modal {
  constructor(app, plugin, rule, onSave) {
    super(app);
    this.plugin = plugin;
    this.rule = cleanExternalLinkRule(rule || {
      prefix: '',
      iconSource: 'text',
      icon: '↗',
      textColor: '#BDE0FE',
      backgroundColor: '#BDE0FE',
    });
    this.onSave = onSave;
    this.activeSuggests = [];
  }

  onOpen() {
    this.render();
  }

  onClose() {
    this.destroySuggests();
  }

  destroySuggests() {
    this.activeSuggests.forEach((suggest) => suggest.destroy());
    this.activeSuggests = [];
  }

  getPrefixValues() {
    const values = getEditableExternalRulePrefixes(this.rule);
    return values.length ? values : [''];
  }

  setPrefixValue(index, value) {
    const values = this.getPrefixValues();
    values[index] = String(value || '').trim();
    setEditableExternalRulePrefixes(this.rule, values);
  }

  removePrefixValue(index) {
    const values = this.getPrefixValues().filter((_, valueIndex) => valueIndex !== index);
    setEditableExternalRulePrefixes(this.rule, values.length ? values : ['']);
    this.render();
  }

  addPrefixValue() {
    const values = this.getPrefixValues();
    values.push('');
    setEditableExternalRulePrefixes(this.rule, values);
    this.render();
  }

  renderPrefixInputs(contentEl) {
    const values = this.getPrefixValues();

    values.forEach((prefix, index) => {
      const setting = new Setting(contentEl)
        .setName(index === 0 ? 'Префиксы ссылок' : `Префикс ${index + 1}`)
        .setDesc(index === 0
          ? 'Можно указать несколько URL-префиксов, которые будут использовать один стиль.'
          : 'Дополнительный URL-префикс для этого же стиля.')
        .addText((text) => {
          text
            .setPlaceholder('https://vk.com/')
            .setValue(prefix || '')
            .onChange((value) => {
              this.setPrefixValue(index, value);
            });
        });

      if (values.length > 1) {
        setting.addButton((button) => {
          button
            .setIcon('x')
            .setTooltip('Удалить префикс')
            .onClick(() => this.removePrefixValue(index));
        });
      }
    });

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText('Добавить префикс')
          .onClick(() => this.addPrefixValue());
      });
  }

  render() {
    this.destroySuggests();
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('mic-rule-modal');
    contentEl.createEl('h2', { text: 'Правило внешней ссылки' });

    this.renderPrefixInputs(contentEl);

    new Setting(contentEl)
      .setName('Источник иконки')
      .setDesc('Иконка ищется в папках поиска. Emoji / текст вставляется как есть.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('svg', 'Иконка из папки')
          .addOption('text', 'Emoji / текст')
          .setValue(normalizeIconSource(this.rule))
          .onChange((value) => {
            this.rule.iconSource = value;
            this.render();
          });
      });

    const iconSource = normalizeIconSource(this.rule);

    new Setting(contentEl)
      .setName(iconSource === 'text' ? 'Emoji / текст' : 'Иконка')
      .setDesc(iconSource === 'text'
        ? 'Можно вставить emoji или любой короткий текст.'
        : 'Имя файла иконки из папок поиска, например telegram.svg. Без расширения по старой совместимости ищется .svg. Можно указать путь до файла.')
      .addText((text) => {
        text
          .setPlaceholder(iconSource === 'text' ? '↗' : 'telegram.svg')
          .setValue(this.rule.icon || '')
          .onChange((value) => {
            this.rule.icon = value.trim();
          });
        if (iconSource === 'svg') {
          this.activeSuggests.push(new IconNameSuggest(this.app, text.inputEl, this.plugin, (iconName) => {
            this.rule.icon = iconName;
          }));
        }
      });

    addIconColorSettings(contentEl, this.rule, () => this.render());

    addHexColorSetting(contentEl, {
      name: 'Цвет текста',
      desc: 'Цвет применяется к внешним ссылкам с этим префиксом.',
      rule: this.rule,
      property: 'textColor',
      fallback: '#FFFFFF',
    });

    const backgroundSetting = addHexColorSetting(contentEl, {
      name: 'Цвет фона',
      desc: 'Цвет фона плашки. Прозрачность задается общей настройкой плагина.',
      rule: this.rule,
      property: 'backgroundColor',
      fallback: this.rule.textColor || '#BDE0FE',
    });
    backgroundSetting.controlEl.createSpan({ cls: 'mic-setting-inline-label', text: 'Заливать фон' });
    backgroundSetting.addToggle((toggle) => {
      toggle
        .setValue(this.rule.fillBackground !== false)
        .onChange((value) => {
          setRuleFillBackground(this.rule, value);
        });
    });

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText('Сохранить')
          .setCta()
          .onClick(async () => {
            const nextRule = cleanExternalLinkRule(this.rule);
            if (!nextRule.prefix) {
              new Notice('Vault Badge Styles: укажи префикс ссылки');
              return;
            }
            await this.onSave(nextRule);
            this.close();
          });
      })
      .addButton((button) => {
        button
          .setButtonText('Отмена')
          .onClick(() => this.close());
      });
  }
}

class PropertyValueRuleEditModal extends Modal {
  constructor(app, plugin, rule, onSave) {
    super(app);
    this.plugin = plugin;
    this.rule = cleanPropertyValueRule(rule || {
      property: '',
      value: '',
      iconSource: 'text',
      icon: '',
      textColor: '#FFFFFF',
      backgroundColor: '#FFFFFF',
    });
    this.onSave = onSave;
    this.activeSuggests = [];
  }

  onOpen() {
    this.render();
  }

  onClose() {
    this.destroySuggests();
  }

  destroySuggests() {
    this.activeSuggests.forEach((suggest) => suggest.destroy());
    this.activeSuggests = [];
  }

  getPairValues() {
    const pairs = getEditablePropertyValuePairs(this.rule);
    return pairs.length ? pairs : [{ property: '', value: '' }];
  }

  setPairValue(index, patch) {
    const pairs = this.getPairValues();
    pairs[index] = {
      ...(pairs[index] || { property: '', value: '' }),
      ...patch,
    };
    setEditablePropertyValuePairs(this.rule, pairs);
  }

  removePairValue(index) {
    const pairs = this.getPairValues().filter((_, pairIndex) => pairIndex !== index);
    setEditablePropertyValuePairs(this.rule, pairs.length ? pairs : [{ property: '', value: '' }]);
    this.render();
  }

  addPairValue() {
    const pairs = this.getPairValues();
    pairs.push({ property: '', value: '' });
    setEditablePropertyValuePairs(this.rule, pairs);
    this.render();
  }

  getPropertyNameSuggestions(query) {
    const normalizedQuery = normalizePropertyNameKey(query);
    const names = new Set();

    for (const rule of this.plugin.settings.propertyValueRules || []) {
      for (const pair of getPropertyValueRulePairs(rule)) {
        const property = normalizePropertyName(pair.property);
        if (property) names.add(property);
      }
    }

    for (const file of this.app.vault.getFiles()) {
      if (file.extension !== 'md') continue;
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!frontmatter || typeof frontmatter !== 'object') continue;

      Object.keys(frontmatter)
        .filter((key) => key && key !== 'position')
        .forEach((key) => names.add(key));
    }

    return [...names]
      .filter((name) => !normalizedQuery || normalizePropertyNameKey(name).includes(normalizedQuery))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 50);
  }

  getPropertyValueSuggestions(query, propertyName) {
    const propertyKey = normalizePropertyNameKey(propertyName);
    const normalizedQuery = normalizePropertyValueKey(query);
    const values = new Set();

    for (const rule of this.plugin.settings.propertyValueRules || []) {
      for (const pair of getPropertyValueRulePairs(rule)) {
        if (propertyKey && normalizePropertyNameKey(pair.property) !== propertyKey) continue;
        flattenPropertyValues(pair.value).forEach((value) => values.add(value));
      }
    }

    for (const file of this.app.vault.getFiles()) {
      if (file.extension !== 'md') continue;
      const frontmatter = this.app.metadataCache.getFileCache(file)?.frontmatter;
      if (!frontmatter || typeof frontmatter !== 'object') continue;

      for (const [key, value] of Object.entries(frontmatter)) {
        if (!key || key === 'position') continue;
        if (propertyKey && normalizePropertyNameKey(key) !== propertyKey) continue;
        flattenPropertyValues(value).forEach((item) => values.add(item));
      }
    }

    return [...values]
      .filter((value) => !normalizedQuery || normalizePropertyValueKey(value).includes(normalizedQuery))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 50);
  }

  renderPairInputs(contentEl) {
    const pairs = this.getPairValues();

    pairs.forEach((pair, index) => {
      const setting = new Setting(contentEl)
        .setName(index === 0 ? 'Пары свойство + значение' : `Пара ${index + 1}`)
        .setDesc(index === 0
          ? 'Можно указать несколько точных пар, которые будут использовать один стиль.'
          : 'Дополнительная пара для этого же стиля.')
        .addText((text) => {
          text
            .setPlaceholder('Task status')
            .setValue(pair.property || '')
            .onChange((value) => {
              this.setPairValue(index, { property: normalizePropertyName(value) });
            });
          this.activeSuggests.push(new TextValueSuggest(text.inputEl, (query) => this.getPropertyNameSuggestions(query), (value) => {
            this.setPairValue(index, { property: normalizePropertyName(value) });
            text.setValue(value);
          }, 'Property suggestions'));
        })
        .addText((text) => {
          text
            .setPlaceholder('done')
            .setValue(pair.value || '')
            .onChange((value) => {
              this.setPairValue(index, { value: normalizePropertyValue(value) });
            });
          this.activeSuggests.push(new TextValueSuggest(text.inputEl, (query) => this.getPropertyValueSuggestions(query, this.getPairValues()[index]?.property), (value) => {
            this.setPairValue(index, { value: normalizePropertyValue(value) });
            text.setValue(value);
          }, 'Property value suggestions'));
        });

      if (pairs.length > 1) {
        setting.addButton((button) => {
          button
            .setIcon('x')
            .setTooltip('Удалить пару')
            .onClick(() => this.removePairValue(index));
        });
      }
    });

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText('Добавить пару')
          .onClick(() => this.addPairValue());
      });
  }

  render() {
    this.destroySuggests();
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('mic-rule-modal');
    contentEl.createEl('h2', { text: 'Правило значения свойства' });

    this.renderPairInputs(contentEl);

    new Setting(contentEl)
      .setName('Источник иконки')
      .setDesc('Иконка ищется в папках поиска. Emoji / текст вставляется как есть.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('svg', 'Иконка из папки')
          .addOption('text', 'Emoji / текст')
          .setValue(normalizeIconSource(this.rule))
          .onChange((value) => {
            this.rule.iconSource = value;
            this.render();
          });
      });

    const iconSource = normalizeIconSource(this.rule);

    new Setting(contentEl)
      .setName(iconSource === 'text' ? 'Emoji / текст' : 'Иконка')
      .setDesc(iconSource === 'text'
        ? 'Можно вставить emoji или любой короткий текст.'
        : 'Имя файла иконки из папок поиска, например task.svg. Без расширения по старой совместимости ищется .svg. Можно указать путь до файла.')
      .addText((text) => {
        text
          .setPlaceholder(iconSource === 'text' ? '✅' : 'task.svg')
          .setValue(this.rule.icon || '')
          .onChange((value) => {
            this.rule.icon = value.trim();
          });
        if (iconSource === 'svg') {
          this.activeSuggests.push(new IconNameSuggest(this.app, text.inputEl, this.plugin, (iconName) => {
            this.rule.icon = iconName;
          }));
        }
      });

    addIconColorSettings(contentEl, this.rule, () => this.render());

    addHexColorSetting(contentEl, {
      name: 'Цвет текста',
      desc: 'Цвет применяется к совпавшему значению свойства.',
      rule: this.rule,
      property: 'textColor',
      fallback: '#FFFFFF',
    });

    const backgroundSetting = addHexColorSetting(contentEl, {
      name: 'Цвет фона',
      desc: 'Цвет фона плашки. Прозрачность задается общей настройкой плагина.',
      rule: this.rule,
      property: 'backgroundColor',
      fallback: this.rule.textColor || '#FFFFFF',
    });
    backgroundSetting.controlEl.createSpan({ cls: 'mic-setting-inline-label', text: 'Заливать фон' });
    backgroundSetting.addToggle((toggle) => {
      toggle
        .setValue(this.rule.fillBackground !== false)
        .onChange((value) => {
          setRuleFillBackground(this.rule, value);
        });
    });

    new Setting(contentEl)
      .addButton((button) => {
        button
          .setButtonText('Сохранить')
          .setCta()
          .onClick(async () => {
            const nextRule = cleanPropertyValueRule(this.rule);
            if (!nextRule.property) {
              new Notice('Vault Badge Styles: укажи свойство');
              return;
            }
            if (!nextRule.value) {
              new Notice('Vault Badge Styles: укажи значение свойства');
              return;
            }
            await this.onSave(nextRule);
            this.close();
          });
      })
      .addButton((button) => {
        button
          .setButtonText('Отмена')
          .onClick(() => this.close());
      });
  }
}

class VaultBadgeStylesSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
    this.ruleSearchQuery = '';
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Иконки и цвета заметок' });

    new Setting(containerEl)
      .setName('Папки поиска иконок')
      .setDesc('Один путь относительно хранилища на строку. Короткое имя иконки ищется в этих папках.')
      .addTextArea((text) => {
        text
          .setValue(this.plugin.settings.iconSearchPaths.join('\n'))
          .onChange(async (value) => {
            this.plugin.settings.iconSearchPaths = value
              .split('\n')
              .map((line) => line.trim())
              .filter(Boolean);
            await this.plugin.saveSettingsAndRefresh();
          });
        text.inputEl.rows = 4;
        text.inputEl.cols = 42;
      });

    this.renderRules(containerEl);

    this.addTextSetting(containerEl, 'Размер иконки по умолчанию', 'iconSize');
    this.addTextSetting(containerEl, 'Размер иконки в ссылках', 'linkIconSize');
    this.addTextSetting(containerEl, 'Размер иконки в дереве файлов', 'fileExplorerIconSize');

    this.addToggleSetting(containerEl, 'Включить отрисовку в дереве файлов', 'enableFileExplorer');
    this.addToggleSetting(containerEl, 'Включить отрисовку в заголовках вкладок', 'enableTabHeaders');
    this.addToggleSetting(containerEl, 'Включить отрисовку ссылок в режиме просмотра', 'enableReadingViewLinks');
    this.addToggleSetting(containerEl, 'Включить отрисовку ссылок в Live Preview', 'enableLivePreviewLinks', 'Зарезервировано для отдельной реализации CodeMirror.');
    this.addToggleSetting(containerEl, 'Включить отрисовку в свойствах, базах и других панелях', 'enableGenericInternalLinks');
    this.addToggleSetting(containerEl, 'Включить отрисовку значений свойств', 'enablePropertyValues');
    this.addToggleSetting(containerEl, 'Показывать внутренние ссылки как теги', 'enableTagStyleInternalLinks');
    this.addToggleSetting(containerEl, 'Показывать внешние ссылки как теги', 'enableTagStyleExternalLinks');
    this.addToggleSetting(containerEl, 'Показывать дерево файлов как теги', 'enableTagStyleFileExplorer');
    this.addToggleSetting(containerEl, 'Показывать ссылки в Live Preview как теги', 'enableTagStyleLivePreviewLinks');
    this.addToggleSetting(containerEl, 'Показывать значения свойств как теги', 'enableTagStylePropertyValues');
    this.addSliderSetting(containerEl, 'Прозрачность фона плашек', 'tagBackgroundOpacity', 'Общая прозрачность фона для ссылок, внешних ссылок, значений свойств и дерева файлов.');
    this.addToggleSetting(containerEl, 'Сокращать пути внутренних ссылок в режиме просмотра', 'enableShortenInternalLinks');
    this.addToggleSetting(containerEl, 'Сокращать вложенные теги в режиме просмотра', 'enableShortenTags');
    this.addToggleSetting(containerEl, 'Автообновлять пути правил при переименовании файлов и папок', 'autoUpdateRulePathsOnRename', 'Если файл или папка переименованы внутри Obsidian, правила каталогов и файлов будут перенесены на новый путь.');
  }

  renderRules(containerEl) {
    const rulesSearch = new Setting(containerEl)
      .setName('Поиск по правилам')
      .setDesc('Ищет по пути, префиксу, типу, иконке, цветам и флагу каскада. Поиск не сохраняется в конфиг.')
      .addText((text) => {
        text
          .setPlaceholder('Development, svg, каскадно, https...')
          .setValue(this.ruleSearchQuery)
          .onChange((value) => {
            this.ruleSearchQuery = value;
            this.renderRuleSections(rulesContainer);
          });
      });
    rulesSearch.settingEl.addClass('mic-rules-search');

    const rulesContainer = containerEl.createDiv({ cls: 'mic-rules-container' });
    this.renderRuleSections(rulesContainer);
  }

  renderRuleSections(containerEl) {
    containerEl.empty();
    this.renderPathRulesSection(
      containerEl,
      'folderRules',
      'folder',
      'Правила каталогов',
      'Каталоги могут каскадно задавать стиль всем вложенным файлам и папкам.',
      'Добавить каталог'
    );
    this.renderPathRulesSection(
      containerEl,
      'fileRules',
      'file',
      'Правила файлов',
      'Файловые правила применяются только к точному пути файла любого формата.',
      'Добавить файл'
    );
    this.renderExternalRulesSection(containerEl);
    this.renderPropertyValueRulesSection(containerEl);
  }

  renderPathRulesSection(containerEl, key, type, titleText, description, addButtonText) {
    const searchQuery = this.getNormalizedRuleSearchQuery();
    const rulesHeader = new Setting(containerEl)
      .setName(titleText)
      .setDesc(description)
      .addButton((button) => {
        button
          .setButtonText(addButtonText)
          .setCta()
          .onClick(() => {
            new RuleEditModal(this.app, this.plugin, null, async (rule) => {
              await this.savePathRules(key, type, [...(this.plugin.settings[key] || []), rule]);
              this.display();
            }, type).open();
          });
      });

    rulesHeader.settingEl.addClass('mic-rules-header');

    const rules = Array.isArray(this.plugin.settings[key])
      ? this.plugin.settings[key].map((rule) => cleanPathRule(rule, type)).filter((rule) => rule.path)
      : [];
    const visibleRules = rules
      .map((rule, index) => ({ rule, index }))
      .filter(({ rule }) => this.pathRuleMatchesSearch(rule, type));

    const rulesContainer = containerEl.createDiv({ cls: 'mic-rules-list' });

    if (!rules.length) {
      rulesContainer.createDiv({ cls: 'setting-item-description', text: 'Правил пока нет.' });
      return;
    }

    if (searchQuery) {
      rulesContainer.createDiv({
        cls: 'setting-item-description mic-rules-search-count',
        text: `Показано ${visibleRules.length} из ${rules.length}`,
      });
    }

    if (!visibleRules.length) {
      rulesContainer.createDiv({ cls: 'setting-item-description', text: 'Ничего не найдено.' });
      return;
    }

    visibleRules.forEach(({ rule, index }) => {
      this.renderPathRuleRow(rulesContainer, rules, key, type, rule, index);
    });
  }

  renderExternalRulesSection(containerEl) {
    const searchQuery = this.getNormalizedRuleSearchQuery();
    const rulesHeader = new Setting(containerEl)
      .setName('Правила внешних ссылок')
      .setDesc('Правило применяется к ссылке, если href начинается с указанного префикса. Более длинный префикс сильнее короткого.')
      .addButton((button) => {
        button
          .setButtonText('Добавить ссылку')
          .setCta()
          .onClick(() => {
            new ExternalLinkRuleEditModal(this.app, this.plugin, null, async (rule) => {
              await this.saveExternalLinkRules([...(this.plugin.settings.externalLinkRules || []), rule]);
              this.display();
            }).open();
          });
      });

    rulesHeader.settingEl.addClass('mic-rules-header');

    const rules = Array.isArray(this.plugin.settings.externalLinkRules)
      ? this.plugin.settings.externalLinkRules.map((rule) => cleanExternalLinkRule(rule)).filter((rule) => rule.prefix)
      : [];
    const visibleRules = rules
      .map((rule, index) => ({ rule, index }))
      .filter(({ rule }) => this.externalRuleMatchesSearch(rule));

    const rulesContainer = containerEl.createDiv({ cls: 'mic-rules-list' });

    if (!rules.length) {
      rulesContainer.createDiv({ cls: 'setting-item-description', text: 'Правил пока нет.' });
      return;
    }

    if (searchQuery) {
      rulesContainer.createDiv({
        cls: 'setting-item-description mic-rules-search-count',
        text: `Показано ${visibleRules.length} из ${rules.length}`,
      });
    }

    if (!visibleRules.length) {
      rulesContainer.createDiv({ cls: 'setting-item-description', text: 'Ничего не найдено.' });
      return;
    }

    visibleRules.forEach(({ rule, index }) => {
      this.renderExternalRuleRow(rulesContainer, rules, rule, index);
    });
  }

  renderPropertyValueRulesSection(containerEl) {
    const searchQuery = this.getNormalizedRuleSearchQuery();
    const rulesHeader = new Setting(containerEl)
      .setName('Правила значений свойств')
      .setDesc('Правило применяется только к точной паре свойство + значение. Например: Статус = 🟢 done.')
      .addButton((button) => {
        button
          .setButtonText('Добавить значение')
          .setCta()
          .onClick(() => {
            new PropertyValueRuleEditModal(this.app, this.plugin, null, async (rule) => {
              await this.savePropertyValueRules([...(this.plugin.settings.propertyValueRules || []), rule]);
              this.display();
            }).open();
          });
      });

    rulesHeader.settingEl.addClass('mic-rules-header');

    const rules = Array.isArray(this.plugin.settings.propertyValueRules)
      ? this.plugin.settings.propertyValueRules.map((rule) => cleanPropertyValueRule(rule)).filter((rule) => rule.property && rule.value)
      : [];
    const visibleRules = rules
      .map((rule, index) => ({ rule, index }))
      .filter(({ rule }) => this.propertyValueRuleMatchesSearch(rule));

    const rulesContainer = containerEl.createDiv({ cls: 'mic-rules-list' });

    if (!rules.length) {
      rulesContainer.createDiv({ cls: 'setting-item-description', text: 'Правил пока нет.' });
      return;
    }

    if (searchQuery) {
      rulesContainer.createDiv({
        cls: 'setting-item-description mic-rules-search-count',
        text: `Показано ${visibleRules.length} из ${rules.length}`,
      });
    }

    if (!visibleRules.length) {
      rulesContainer.createDiv({ cls: 'setting-item-description', text: 'Ничего не найдено.' });
      return;
    }

    visibleRules.forEach(({ rule, index }) => {
      this.renderPropertyValueRuleRow(rulesContainer, rules, rule, index);
    });
  }

  getNormalizedRuleSearchQuery() {
    return String(this.ruleSearchQuery || '').trim().toLowerCase();
  }

  ruleTextMatches(parts) {
    const query = this.getNormalizedRuleSearchQuery();
    if (!query) return true;

    const haystack = parts
      .filter((part) => part !== undefined && part !== null)
      .map((part) => String(part).toLowerCase())
      .join(' ');

    return query.split(/\s+/).filter(Boolean).every((token) => haystack.includes(token));
  }

  pathRuleMatchesSearch(rule, type) {
    const paths = getPathRulePaths(rule);
    return this.ruleTextMatches([
      type,
      type === 'folder' ? 'каталог папка folder' : 'файл file',
      paths.join(' '),
      paths.map((path) => labelFromPath(path)).join(' '),
      normalizeIconSource(rule),
      rule.icon,
      normalizeIconColorMode(rule),
      rule.iconColor,
      rule.textColor,
      rule.backgroundColor,
      rule.fillBackground === false ? 'без заливки no fill' : 'заливать фон fill background',
      rule.cascade ? 'каскадно cascade recursive вложенные' : '',
    ]);
  }

  externalRuleMatchesSearch(rule) {
    const prefixes = getExternalRulePrefixes(rule);
    return this.ruleTextMatches([
      'external внешняя ссылка prefix префикс',
      prefixes.join(' '),
      normalizeIconSource(rule),
      rule.icon,
      normalizeIconColorMode(rule),
      rule.iconColor,
      rule.textColor,
      rule.backgroundColor,
      rule.fillBackground === false ? 'без заливки no fill' : 'заливать фон fill background',
    ]);
  }

  propertyValueRuleMatchesSearch(rule) {
    const pairs = getPropertyValueRulePairs(rule);
    return this.ruleTextMatches([
      'property значение свойство status статус',
      pairs.map((pair) => `${pair.property}:${pair.value}`).join(' '),
      pairs.map((pair) => pair.property).join(' '),
      pairs.map((pair) => pair.value).join(' '),
      normalizeIconSource(rule),
      rule.icon,
      normalizeIconColorMode(rule),
      rule.iconColor,
      rule.textColor,
      rule.backgroundColor,
      rule.fillBackground === false ? 'без заливки no fill' : 'заливать фон fill background',
    ]);
  }

  renderPathRuleRow(containerEl, rules, key, type, rule, index) {
    const row = containerEl.createDiv({ cls: 'mic-rule-row' });
    const info = row.createDiv({ cls: 'mic-rule-info' });
    const title = info.createDiv({ cls: 'mic-rule-title' });
    const paths = getPathRulePaths(rule);
    const primaryPath = paths[0] || rule.path;
    title.setText(`${index + 1}. ${type === 'folder' ? 'Каталог' : 'Файл'}: ${formatRuleMatchers(paths)}`);

    const previewLine = info.createDiv({ cls: 'mic-rule-preview-line' });
    const previewStyle = this.plugin.styleIndex.getDirectStyleForPath(primaryPath)
      || this.plugin.styleIndex.getEffectiveStyleForPath(primaryPath);
    this.renderRulePreview(previewLine, labelFromPath(primaryPath), previewStyle);
    if (paths.length > 1) {
      previewLine.createSpan({ cls: 'mic-rule-badge', text: `+${paths.length - 1}` });
    }
    if (type === 'folder' && rule.cascade) {
      previewLine.createSpan({ cls: 'mic-rule-badge', text: 'каскадно' });
    }

    const actions = row.createDiv({ cls: 'mic-rule-actions' });

    this.addIconButton(actions, 'arrow-up', 'Вверх', index === 0, async () => {
      await this.movePathRule(key, type, index, -1);
    });
    this.addIconButton(actions, 'arrow-down', 'Вниз', index === rules.length - 1, async () => {
      await this.movePathRule(key, type, index, 1);
    });
    this.addIconButton(actions, 'copy', 'Скопировать', false, async () => {
      await this.duplicatePathRule(key, type, index);
    });
    this.addIconButton(actions, 'pencil', 'Редактировать', false, () => {
        new RuleEditModal(this.app, this.plugin, rule, async (nextRule) => {
          const nextRules = [...rules];
          nextRules[index] = nextRule;
          await this.savePathRules(key, type, nextRules);
          this.display();
        }, type).open();
    });
    this.addIconButton(actions, 'x', 'Удалить', false, async () => {
      const nextRules = rules.filter((_, ruleIndex) => ruleIndex !== index);
      await this.savePathRules(key, type, nextRules);
      this.display();
    });
  }

  renderExternalRuleRow(containerEl, rules, rule, index) {
    const row = containerEl.createDiv({ cls: 'mic-rule-row' });
    const info = row.createDiv({ cls: 'mic-rule-info' });
    const title = info.createDiv({ cls: 'mic-rule-title' });
    const prefixes = getExternalRulePrefixes(rule);
    const primaryPrefix = prefixes[0] || rule.prefix;
    title.setText(`${index + 1}. Префиксы: ${formatRuleMatchers(prefixes)}`);

    const previewLine = info.createDiv({ cls: 'mic-rule-preview-line' });
    const previewStyle = this.plugin.styleIndex.getDirectStyleForExternalPrefix(primaryPrefix)
      || this.plugin.styleIndex.getEffectiveStyleForExternalUrl(primaryPrefix);
    this.renderRulePreview(previewLine, primaryPrefix, previewStyle);
    if (prefixes.length > 1) {
      previewLine.createSpan({ cls: 'mic-rule-badge', text: `+${prefixes.length - 1}` });
    }

    const actions = row.createDiv({ cls: 'mic-rule-actions' });

    this.addIconButton(actions, 'arrow-up', 'Вверх', index === 0, async () => {
      await this.moveExternalLinkRule(index, -1);
    });
    this.addIconButton(actions, 'arrow-down', 'Вниз', index === rules.length - 1, async () => {
      await this.moveExternalLinkRule(index, 1);
    });
    this.addIconButton(actions, 'copy', 'Скопировать', false, async () => {
      await this.duplicateExternalLinkRule(index);
    });
    this.addIconButton(actions, 'pencil', 'Редактировать', false, () => {
      new ExternalLinkRuleEditModal(this.app, this.plugin, rule, async (nextRule) => {
        const nextRules = [...rules];
        nextRules[index] = nextRule;
        await this.saveExternalLinkRules(nextRules);
        this.display();
      }).open();
    });
    this.addIconButton(actions, 'x', 'Удалить', false, async () => {
      const nextRules = rules.filter((_, ruleIndex) => ruleIndex !== index);
      await this.saveExternalLinkRules(nextRules);
      this.display();
    });
  }

  renderPropertyValueRuleRow(containerEl, rules, rule, index) {
    const row = containerEl.createDiv({ cls: 'mic-rule-row' });
    const info = row.createDiv({ cls: 'mic-rule-info' });
    const title = info.createDiv({ cls: 'mic-rule-title' });
    const pairs = getPropertyValueRulePairs(rule);
    const primaryPair = pairs[0] || { property: rule.property, value: rule.value };
    title.setText(`${index + 1}. Свойства: ${formatRuleMatchers(pairs.map((pair) => `${pair.property} = ${pair.value}`))}`);

    const previewLine = info.createDiv({ cls: 'mic-rule-preview-line' });
    const previewStyle = this.plugin.styleIndex.getEffectiveStyleForPropertyValue(primaryPair.property, primaryPair.value);
    this.renderRulePreview(previewLine, primaryPair.value, previewStyle);
    if (pairs.length > 1) {
      previewLine.createSpan({ cls: 'mic-rule-badge', text: `+${pairs.length - 1}` });
    }

    const actions = row.createDiv({ cls: 'mic-rule-actions' });

    this.addIconButton(actions, 'arrow-up', 'Вверх', index === 0, async () => {
      await this.movePropertyValueRule(index, -1);
    });
    this.addIconButton(actions, 'arrow-down', 'Вниз', index === rules.length - 1, async () => {
      await this.movePropertyValueRule(index, 1);
    });
    this.addIconButton(actions, 'copy', 'Скопировать', false, async () => {
      await this.duplicatePropertyValueRule(index);
    });
    this.addIconButton(actions, 'pencil', 'Редактировать', false, () => {
      new PropertyValueRuleEditModal(this.app, this.plugin, rule, async (nextRule) => {
        const nextRules = [...rules];
        nextRules[index] = nextRule;
        await this.savePropertyValueRules(nextRules);
        this.display();
      }).open();
    });
    this.addIconButton(actions, 'x', 'Удалить', false, async () => {
      const nextRules = rules.filter((_, ruleIndex) => ruleIndex !== index);
      await this.savePropertyValueRules(nextRules);
      this.display();
    });
  }

  renderRulePreview(containerEl, label, style) {
    const preview = containerEl.createSpan({ cls: 'mic-rule-preview' });
    if (style && style.textColor) {
      preview.classList.add(COLORED_TEXT_CLASS);
      preview.style.setProperty('--mic-text-color', style.textColor);
    }
    applyStyleBackgroundVariables(preview, style);
    if (hasRenderableIcon(style)) {
      preview.appendChild(createIconElement(style, 'mic-rule-preview-icon', this.plugin.settings.linkIconSize));
    }
    preview.createSpan({ text: label });
  }

  addIconButton(containerEl, icon, tooltip, disabled, callback) {
    new ButtonComponent(containerEl)
      .setIcon(icon)
      .setTooltip(tooltip)
      .setDisabled(disabled)
      .onClick(callback);
  }

  async duplicatePathRule(key, type, index) {
    const rules = (this.plugin.settings[key] || []).map((rule) => cleanPathRule(rule, type));
    if (!rules[index]) return;

    const nextRules = [...rules];
    nextRules.splice(index + 1, 0, cleanPathRule(clonePlainRule(rules[index]), type));

    await this.savePathRules(key, type, nextRules);
    new Notice('Правило скопировано');
    this.display();
  }

  async duplicateExternalLinkRule(index) {
    const rules = (this.plugin.settings.externalLinkRules || []).map((rule) => cleanExternalLinkRule(rule));
    if (!rules[index]) return;

    const nextRules = [...rules];
    nextRules.splice(index + 1, 0, cleanExternalLinkRule(clonePlainRule(rules[index])));

    await this.saveExternalLinkRules(nextRules);
    new Notice('Правило скопировано');
    this.display();
  }

  async duplicatePropertyValueRule(index) {
    const rules = (this.plugin.settings.propertyValueRules || [])
      .map((rule) => cleanPropertyValueRule(rule))
      .filter((rule) => rule.property && rule.value);
    if (!rules[index]) return;

    const nextRules = [...rules];
    nextRules.splice(index + 1, 0, cleanPropertyValueRule(clonePlainRule(rules[index])));

    await this.savePropertyValueRules(nextRules);
    new Notice('Правило скопировано');
    this.display();
  }

  async movePathRule(key, type, index, direction) {
    const rules = (this.plugin.settings[key] || []).map((rule) => cleanPathRule(rule, type));
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= rules.length) return;

    const movingRule = rules[index];
    rules[index] = rules[nextIndex];
    rules[nextIndex] = movingRule;

    await this.savePathRules(key, type, rules);
    this.display();
  }

  async moveExternalLinkRule(index, direction) {
    const rules = (this.plugin.settings.externalLinkRules || []).map((rule) => cleanExternalLinkRule(rule));
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= rules.length) return;

    const movingRule = rules[index];
    rules[index] = rules[nextIndex];
    rules[nextIndex] = movingRule;

    await this.saveExternalLinkRules(rules);
    this.display();
  }

  async movePropertyValueRule(index, direction) {
    const rules = (this.plugin.settings.propertyValueRules || [])
      .map((rule) => cleanPropertyValueRule(rule))
      .filter((rule) => rule.property && rule.value);
    const nextIndex = index + direction;
    if (nextIndex < 0 || nextIndex >= rules.length) return;

    const movingRule = rules[index];
    rules[index] = rules[nextIndex];
    rules[nextIndex] = movingRule;

    await this.savePropertyValueRules(rules);
    this.display();
  }

  async savePathRules(key, type, rules) {
    this.plugin.settings[key] = rules.map((rule) => cleanPathRule(rule, type)).filter((rule) => rule.path);
    await this.plugin.saveSettingsAndRefresh();
  }

  async saveExternalLinkRules(rules) {
    this.plugin.settings.externalLinkRules = rules.map((rule) => cleanExternalLinkRule(rule)).filter((rule) => rule.prefix);
    await this.plugin.saveSettingsAndRefresh();
  }

  async savePropertyValueRules(rules) {
    this.plugin.settings.propertyValueRules = rules.map((rule) => cleanPropertyValueRule(rule)).filter((rule) => rule.property && rule.value);
    await this.plugin.saveSettingsAndRefresh();
  }

  addTextSetting(containerEl, name, key) {
    new Setting(containerEl)
      .setName(name)
      .addText((text) => {
        text
          .setValue(String(this.plugin.settings[key]))
          .onChange(async (value) => {
            this.plugin.settings[key] = value.trim();
            await this.plugin.saveSettingsAndRefresh();
          });
      });
  }

  addToggleSetting(containerEl, name, key, description) {
    const setting = new Setting(containerEl).setName(name);
    if (description) setting.setDesc(description);

    setting.addToggle((toggle) => {
      toggle
        .setValue(Boolean(this.plugin.settings[key]))
        .onChange(async (value) => {
          this.plugin.settings[key] = value;
          await this.plugin.saveSettingsAndRefresh();
        });
    });
  }

  addSliderSetting(containerEl, name, key, description) {
    const setting = new Setting(containerEl).setName(name);
    if (description) setting.setDesc(description);

    setting.addSlider((slider) => {
      slider
        .setLimits(0, 100, 1)
        .setValue(normalizeOpacity(this.plugin.settings[key]))
        .setDynamicTooltip()
        .onChange(async (value) => {
          this.plugin.settings[key] = normalizeOpacity(value);
          await this.plugin.saveSettingsAndRefresh();
        });
    });
  }
}

module.exports = class VaultBadgeStylesPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.handleTagClick = this.handleTagClick.bind(this);
    this.applyTagStyleClasses();

    this.iconResolver = new IconResolver(this.app, this.settings);
    this.styleIndex = new StyleIndex(this.app, this.settings, this.iconResolver);
    this.fileExplorerRenderer = new FileExplorerRenderer(this.app, this.settings, this.styleIndex);
    this.tabHeaderRenderer = new TabHeaderRenderer(this.app, this.settings, this.styleIndex);
    this.markdownLinkRenderer = new MarkdownLinkRenderer(this.app, this.settings, this.styleIndex);
    this.genericInternalLinkRenderer = new GenericInternalLinkRenderer(this.app, this.settings, this.markdownLinkRenderer);
    this.scheduleRebuildAndRefresh = debounce(() => this.rebuildAndRefresh(), 200);

    await this.styleIndex.rebuild();

    this.registerMarkdownPostProcessor((element, context) => {
      this.markdownLinkRenderer.process(element, context.sourcePath);
    });
    this.registerDomEvent(document, 'click', this.handleTagClick, { capture: true });

    this.registerEvent(this.app.metadataCache.on('changed', () => this.scheduleRebuildAndRefresh()));
    this.registerEvent(this.app.metadataCache.on('resolved', () => this.scheduleRebuildAndRefresh()));
    this.registerEvent(this.app.vault.on('create', () => this.scheduleRebuildAndRefresh()));
    this.registerEvent(this.app.vault.on('delete', () => this.scheduleRebuildAndRefresh()));
    this.registerEvent(this.app.vault.on('rename', (file, oldPath) => this.handleVaultRename(file, oldPath)));
    this.registerEvent(this.app.workspace.on('layout-change', () => this.refreshRenderers()));

    this.addCommand({
      id: 'rebuild-icon-style-index',
      name: 'Rebuild icon/style index',
      callback: async () => {
        await this.rebuildAndRefresh();
        new Notice('Vault Badge Styles: index rebuilt');
      },
    });

    this.addCommand({
      id: 'refresh-file-explorer-icons',
      name: 'Refresh file explorer icons',
      callback: () => {
        this.fileExplorerRenderer.refresh();
        new Notice('Vault Badge Styles: file explorer refreshed');
      },
    });

    this.addCommand({
      id: 'refresh-reading-view-links',
      name: 'Refresh reading view links',
      callback: () => {
        this.markdownLinkRenderer.refreshOpenReadingViews();
        new Notice('Vault Badge Styles: reading links refreshed');
      },
    });

    this.addCommand({
      id: 'debug-current-effective-styles',
      name: 'Debug current effective styles',
      callback: () => {
        console.table(this.styleIndex.getDebugRows());
        new MatchedPathsModal(this.app, this.styleIndex.getDebugRows(), 'Preview matched paths').open();
        new Notice('Vault Badge Styles: debug table printed to console');
      },
    });

    this.addCommand({
      id: 'preview-matched-paths',
      name: 'Preview matched paths',
      callback: () => {
        const rows = this.styleIndex.getDebugRows();
        console.table(rows);
        new MatchedPathsModal(this.app, rows, 'Preview matched paths').open();
      },
    });

    this.addCommand({
      id: 'debug-current-file-style',
      name: 'Debug current file style',
      callback: () => {
        const file = this.app.workspace.getActiveFile();
        if (!file) {
          new Notice('Vault Badge Styles: no active file');
          return;
        }

        const row = this.styleIndex.getMatchDetailsForPath(file.path, 'file');
        console.table([row]);
        new MatchedPathsModal(this.app, [row], 'Debug current file style').open();
      },
    });

    this.addCommand({
      id: 'validate-rules-and-icons',
      name: 'Validate rules and icons',
      callback: async () => {
        const report = await this.validateRulesAndIcons();
        console.table({
          rules: report.ruleCount,
          resolvedIcons: report.resolvedIconCount,
          missingIcons: report.missingIcons.length,
          rulesWithoutMatches: report.rulesWithoutMatches.length,
          duplicatePaths: report.duplicateRules.length,
        });
        new ValidationReportModal(this.app, report).open();
      },
    });

    this.addCommand({
      id: 'export-config',
      name: 'Export config to vault root',
      callback: async () => {
        await this.exportConfig();
      },
    });

    this.addCommand({
      id: 'import-config',
      name: 'Import config from vault root',
      callback: async () => {
        await this.importConfig();
      },
    });

    this.addSettingTab(new VaultBadgeStylesSettingTab(this.app, this));

    this.app.workspace.onLayoutReady(() => {
      this.fileExplorerRenderer.start();
      this.tabHeaderRenderer.start();
      this.genericInternalLinkRenderer.start();
      this.refreshRenderers();
    });
  }

  onunload() {
    if (this.genericInternalLinkRenderer) this.genericInternalLinkRenderer.stop();
    if (this.tabHeaderRenderer) this.tabHeaderRenderer.stop();
    if (this.fileExplorerRenderer) this.fileExplorerRenderer.stop();
    if (this.markdownLinkRenderer) this.markdownLinkRenderer.clearAll(document.body);
    this.clearTagStyleClasses();
    restoreShortenedRenderedElements(document.body);
  }

  async loadSettings() {
    const data = await this.loadData();
    this.settings = this.normalizeSettingsData(data || {});
  }

  normalizeSettingsData(loadedSettings) {
    const settings = Object.assign({}, DEFAULT_SETTINGS, loadedSettings);
    const legacyRules = Array.isArray(loadedSettings.rules)
      ? loadedSettings.rules.map((rule) => cleanRule(rule)).filter((rule) => rule.path)
      : [];

    settings.folderRules = Array.isArray(loadedSettings.folderRules)
      ? loadedSettings.folderRules.map((rule) => cleanPathRule(rule, 'folder')).filter((rule) => rule.path)
      : legacyRules.filter((rule) => rule.type === 'folder').map((rule) => cleanPathRule(rule, 'folder'));

    settings.fileRules = Array.isArray(loadedSettings.fileRules)
      ? loadedSettings.fileRules.map((rule) => cleanPathRule(rule, 'file')).filter((rule) => rule.path)
      : legacyRules.filter((rule) => rule.type === 'file').map((rule) => cleanPathRule(rule, 'file'));

    settings.externalLinkRules = Array.isArray(loadedSettings.externalLinkRules)
      ? loadedSettings.externalLinkRules.map((rule) => cleanExternalLinkRule(rule)).filter((rule) => rule.prefix)
      : [];

    settings.propertyValueRules = Array.isArray(loadedSettings.propertyValueRules)
      ? loadedSettings.propertyValueRules.map((rule) => cleanPropertyValueRule(rule)).filter((rule) => rule.property && rule.value)
      : [];

    settings.iconSearchPaths = Array.isArray(loadedSettings.iconSearchPaths)
      ? loadedSettings.iconSearchPaths.map((path) => normalizeVaultPath(path).trim()).filter(Boolean)
      : DEFAULT_SETTINGS.iconSearchPaths;

    settings.tagBackgroundOpacity = normalizeOpacity(loadedSettings.tagBackgroundOpacity);

    delete settings.rules;
    return settings;
  }

  async saveSettingsAndRefresh() {
    delete this.settings.rules;
    restoreShortenedRenderedElements(document.body);
    await this.saveData(this.settings);
    this.applyTagStyleClasses();
    this.iconResolver.setSettings(this.settings);
    this.styleIndex.setSettings(this.settings);
    this.fileExplorerRenderer.setSettings(this.settings);
    this.tabHeaderRenderer.setSettings(this.settings);
    this.markdownLinkRenderer.setSettings(this.settings);
    this.genericInternalLinkRenderer.setSettings(this.settings);
    await this.rebuildAndRefresh();
  }

  async rebuildAndRefresh() {
    try {
      await this.styleIndex.rebuild();
      this.refreshRenderers();
    } catch (error) {
      console.error(`[${PLUGIN_ID}] Failed to rebuild style index`, error);
      new Notice('Vault Badge Styles: failed to rebuild index. See console.');
    }
  }

  async handleVaultRename(file, oldPath) {
    if (!this.settings.autoUpdateRulePathsOnRename) {
      this.scheduleRebuildAndRefresh();
      return;
    }

    const newPath = normalizeVaultPath(file && file.path);
    const normalizedOldPath = normalizeVaultPath(oldPath);
    const isFolderRename = file instanceof TFolder;
    const folderResult = renamePathRules(
      this.settings.folderRules,
      normalizedOldPath,
      newPath,
      'folder',
      isFolderRename
    );
    const fileResult = renamePathRules(
      this.settings.fileRules,
      normalizedOldPath,
      newPath,
      'file',
      isFolderRename
    );
    const changed = folderResult.changed + fileResult.changed;

    if (!changed) {
      this.scheduleRebuildAndRefresh();
      return;
    }

    this.settings.folderRules = folderResult.rules;
    this.settings.fileRules = fileResult.rules;

    try {
      await this.saveSettingsAndRefresh();
      new Notice(`Vault Badge Styles: updated ${changed} rule path${changed === 1 ? '' : 's'} after rename`);
    } catch (error) {
      console.error(`[${PLUGIN_ID}] Failed to update rule paths after rename`, error);
      new Notice('Vault Badge Styles: failed to update rule paths after rename. See console.');
      this.scheduleRebuildAndRefresh();
    }
  }

  refreshRenderers() {
    if (this.fileExplorerRenderer) this.fileExplorerRenderer.refresh();
    if (this.tabHeaderRenderer) this.tabHeaderRenderer.refresh();
    if (this.genericInternalLinkRenderer) this.genericInternalLinkRenderer.refresh();
    if (this.markdownLinkRenderer) this.markdownLinkRenderer.refreshOpenReadingViews();
  }

  async validateRulesAndIcons() {
    const pathRules = [
      ...(this.settings.folderRules || []).map((rule) => cleanPathRule(rule, 'folder')),
      ...(this.settings.fileRules || []).map((rule) => cleanPathRule(rule, 'file')),
    ].filter((rule) => rule.path);
    const externalRules = (this.settings.externalLinkRules || [])
      .map((rule) => cleanExternalLinkRule(rule))
      .filter((rule) => rule.prefix);
    const propertyValueRules = (this.settings.propertyValueRules || [])
      .map((rule) => cleanPropertyValueRule(rule))
      .filter((rule) => rule.property && rule.value);
    const allRules = [...pathRules, ...externalRules, ...propertyValueRules];
    const duplicateRuleCounts = new Map();
    const missingIcons = [];
    const rulesWithoutMatches = [];
    let resolvedIconCount = 0;

    for (const rule of pathRules) {
      for (const path of getPathRulePaths(rule)) {
        const duplicateKey = `${rule.type}:${path}`;
        duplicateRuleCounts.set(duplicateKey, (duplicateRuleCounts.get(duplicateKey) || 0) + 1);

        if (!this.rulePathExistsInVault({ ...rule, path })) {
          rulesWithoutMatches.push({ type: rule.type, path });
        }
      }

      const iconResult = await this.validateRuleIcon(rule, `${rule.type}:${formatRuleMatchers(getPathRulePaths(rule))}`);
      if (iconResult === 'resolved') resolvedIconCount += 1;
      if (iconResult && iconResult.status === 'missing') missingIcons.push(iconResult);
    }

    for (const rule of externalRules) {
      for (const prefix of getExternalRulePrefixes(rule)) {
        const duplicateKey = `external:${prefix}`;
        duplicateRuleCounts.set(duplicateKey, (duplicateRuleCounts.get(duplicateKey) || 0) + 1);
      }

      const iconResult = await this.validateRuleIcon(rule, `external:${formatRuleMatchers(getExternalRulePrefixes(rule))}`);
      if (iconResult === 'resolved') resolvedIconCount += 1;
      if (iconResult && iconResult.status === 'missing') missingIcons.push(iconResult);
    }

    for (const rule of propertyValueRules) {
      for (const pair of getPropertyValueRulePairs(rule)) {
        const duplicateKey = `property-value:${propertyValueRuleKey(pair.property, pair.value)}`;
        duplicateRuleCounts.set(duplicateKey, (duplicateRuleCounts.get(duplicateKey) || 0) + 1);
      }

      const label = `property:${formatRuleMatchers(getPropertyValueRulePairs(rule).map((pair) => `${pair.property}=${pair.value}`))}`;
      const iconResult = await this.validateRuleIcon(rule, label);
      if (iconResult === 'resolved') resolvedIconCount += 1;
      if (iconResult && iconResult.status === 'missing') missingIcons.push(iconResult);
    }

    return {
      ruleCount: allRules.length,
      resolvedIconCount,
      missingIcons,
      rulesWithoutMatches,
      duplicateRules: [...duplicateRuleCounts.entries()]
        .filter(([, count]) => count > 1)
        .map(([key, count]) => ({ key, count })),
    };
  }

  async validateRuleIcon(rule, ruleLabel) {
    if (!rule.icon || normalizeIconSource(rule) !== 'svg') return null;

    const iconInfo = await this.iconResolver.resolveIconInfo(rule.icon);
    if (iconInfo.vaultPath) return 'resolved';

    return {
      status: 'missing',
      icon: rule.icon,
      rule: ruleLabel,
      triedPaths: iconInfo.triedPaths,
    };
  }

  rulePathExistsInVault(rule) {
    const path = normalizeVaultPath(rule.path);
    const file = this.app.vault.getAbstractFileByPath(path);

    if (rule.type === 'folder') {
      return file instanceof TFolder || this.app.vault.getAbstractFileByPath(`${path}/${folderName(path)}.md`) instanceof TFile;
    }

    return file instanceof TFile;
  }

  buildConfigExport() {
    return {
      version: CONFIG_EXPORT_VERSION,
      plugin: {
        id: PLUGIN_ID,
        name: PLUGIN_NAME,
      },
      exportedAt: new Date().toISOString(),
      settings: {
        ...this.settings,
        folderRules: (this.settings.folderRules || []).map((rule) => cleanPathRule(rule, 'folder')),
        fileRules: (this.settings.fileRules || []).map((rule) => cleanPathRule(rule, 'file')),
        externalLinkRules: (this.settings.externalLinkRules || []).map((rule) => cleanExternalLinkRule(rule)),
        propertyValueRules: (this.settings.propertyValueRules || []).map((rule) => cleanPropertyValueRule(rule)),
      },
    };
  }

  async exportConfig() {
    await this.app.vault.adapter.write(CONFIG_EXPORT_PATH, JSON.stringify(this.buildConfigExport(), null, 2));
    new Notice(`Vault Badge Styles: config exported to ${CONFIG_EXPORT_PATH}`);
  }

  async importConfig() {
    if (!(await this.app.vault.adapter.exists(CONFIG_EXPORT_PATH))) {
      new Notice(`Vault Badge Styles: ${CONFIG_EXPORT_PATH} not found`);
      return;
    }

    try {
      const rawConfig = await this.app.vault.adapter.read(CONFIG_EXPORT_PATH);
      const parsedConfig = JSON.parse(rawConfig);
      this.settings = this.normalizeSettingsData(parsedConfig.settings || parsedConfig);
      await this.saveSettingsAndRefresh();
      new Notice(`Vault Badge Styles: config imported from ${CONFIG_EXPORT_PATH}`);
    } catch (error) {
      console.error(`[${PLUGIN_ID}] Failed to import config`, error);
      new Notice('Vault Badge Styles: failed to import config. See console.');
    }
  }

  applyTagStyleClasses() {
    document.body.classList.toggle(TAG_STYLE_INTERNAL_LINKS_CLASS, Boolean(this.settings.enableTagStyleInternalLinks));
    document.body.classList.toggle(TAG_STYLE_EXTERNAL_LINKS_CLASS, Boolean(this.settings.enableTagStyleExternalLinks));
    document.body.classList.toggle(TAG_STYLE_FILE_EXPLORER_CLASS, Boolean(this.settings.enableTagStyleFileExplorer));
    document.body.classList.toggle(TAG_STYLE_LIVE_PREVIEW_CLASS, Boolean(this.settings.enableTagStyleLivePreviewLinks));
    document.body.classList.toggle(TAG_STYLE_PROPERTY_VALUES_CLASS, Boolean(this.settings.enableTagStylePropertyValues));
    const opacity = normalizeOpacity(this.settings.tagBackgroundOpacity);
    document.body.style.setProperty('--mic-tag-background-opacity', `${opacity}%`);
    document.body.style.setProperty('--mic-tag-background-alpha', String(opacity / 100));
  }

  clearTagStyleClasses() {
    document.body.classList.remove(
      TAG_STYLE_INTERNAL_LINKS_CLASS,
      TAG_STYLE_EXTERNAL_LINKS_CLASS,
      TAG_STYLE_FILE_EXPLORER_CLASS,
      TAG_STYLE_LIVE_PREVIEW_CLASS,
      TAG_STYLE_PROPERTY_VALUES_CLASS
    );
    document.body.style.removeProperty('--mic-tag-background-opacity');
    document.body.style.removeProperty('--mic-tag-background-alpha');
  }

  handleTagClick(event) {
    if (event.button !== 0) return;

    const target = event.target;
    if (!(target instanceof Element)) return;

    const tag = target.closest(`a.tag[${ORIGINAL_TEXT_ATTR}], span.tag[${ORIGINAL_TEXT_ATTR}]`);
    if (!tag) return;

    const originalTag = tag.getAttribute(ORIGINAL_TEXT_ATTR);
    if (!originalTag || !originalTag.startsWith('#')) return;

    const searchPlugin = this.app.internalPlugins.getPluginById('global-search');
    if (!searchPlugin || !searchPlugin.instance || typeof searchPlugin.instance.openGlobalSearch !== 'function') return;

    event.preventDefault();
    event.stopImmediatePropagation();

    searchPlugin.instance.openGlobalSearch(`tag:${originalTag}`);
  }
};
