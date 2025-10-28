"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeEmailHtml = sanitizeEmailHtml;
exports.isHtmlSafe = isHtmlSafe;
exports.getDangerousPatterns = getDangerousPatterns;
const sanitize_html_1 = __importDefault(require("sanitize-html"));
const ALLOWED_TAGS = [
    'p', 'br', 'hr', 'span', 'div',
    'strong', 'em', 'u', 'b', 'i', 's', 'strike', 'small', 'sub', 'sup',
    'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'ul', 'ol', 'li',
    'a', 'img',
    'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
    'blockquote', 'pre', 'code',
    'section', 'article', 'header', 'footer', 'main', 'aside', 'nav',
];
const ALLOWED_ATTRIBUTES = {
    'a': ['href', 'title', 'target', 'rel'],
    'img': ['src', 'alt', 'title', 'width', 'height', 'style'],
    'table': ['border', 'cellpadding', 'cellspacing', 'width', 'style'],
    'td': ['colspan', 'rowspan', 'align', 'valign', 'width', 'style'],
    'th': ['colspan', 'rowspan', 'align', 'valign', 'width', 'style'],
    '*': ['class', 'id', 'style', 'dir', 'lang'],
};
const ALLOWED_SCHEMES = ['http', 'https', 'mailto'];
const ALLOWED_STYLES = {
    '*': {
        'width': [/^\d+(?:px|em|rem|%)?$/],
        'height': [/^\d+(?:px|em|rem|%)?$/],
        'max-width': [/^\d+(?:px|em|rem|%)?$/],
        'max-height': [/^\d+(?:px|em|rem|%)?$/],
        'margin': [/^[\d\s]+(?:px|em|rem|%)?$/],
        'padding': [/^[\d\s]+(?:px|em|rem|%)?$/],
        'color': [/^#[0-9a-fA-F]{3,6}$/, /^rgb\([\d\s,]+\)$/, /^rgba\([\d\s,]+\)$/],
        'background-color': [/^#[0-9a-fA-F]{3,6}$/, /^rgb\([\d\s,]+\)$/, /^rgba\([\d\s,]+\)$/],
        'font-size': [/^\d+(?:px|em|rem|%)?$/],
        'font-family': [/.*/],
        'font-weight': [/^(?:normal|bold|bolder|lighter|\d+)$/],
        'font-style': [/^(?:normal|italic|oblique)$/],
        'text-align': [/^(?:left|right|center|justify)$/],
        'text-decoration': [/^(?:none|underline|overline|line-through)$/],
        'line-height': [/^\d+(?:px|em|rem|%)?$/],
        'border': [/^[\d\s]+(?:px)?\s+(?:solid|dashed|dotted)?\s*#?[0-9a-fA-F]*$/],
        'border-radius': [/^\d+(?:px|em|rem|%)?$/],
        'display': [/^(?:block|inline|inline-block|flex|grid|none)$/],
    },
};
function sanitizeEmailHtml(html) {
    if (!html || typeof html !== 'string') {
        return '';
    }
    return (0, sanitize_html_1.default)(html, {
        allowedTags: ALLOWED_TAGS,
        allowedAttributes: ALLOWED_ATTRIBUTES,
        allowedSchemes: ALLOWED_SCHEMES,
        allowedStyles: ALLOWED_STYLES,
        disallowedTagsMode: 'discard',
        selfClosing: ['img', 'br', 'hr'],
        transformTags: {
            'a': (_tagName, attribs) => {
                return {
                    tagName: 'a',
                    attribs: {
                        ...attribs,
                        target: '_blank',
                        rel: 'noopener noreferrer',
                    },
                };
            },
        },
    });
}
function isHtmlSafe(html) {
    if (!html)
        return true;
    const sanitized = sanitizeEmailHtml(html);
    const normalizedOriginal = html.replace(/\s+/g, ' ').trim();
    const normalizedSanitized = sanitized.replace(/\s+/g, ' ').trim();
    return normalizedOriginal === normalizedSanitized;
}
function getDangerousPatterns(html) {
    if (!html)
        return [];
    const patterns = [];
    const dangerousTags = [
        'script', 'iframe', 'object', 'embed', 'link', 'style',
        'form', 'input', 'button', 'textarea', 'select',
        'meta', 'base', 'frame', 'frameset',
    ];
    for (const tag of dangerousTags) {
        const regex = new RegExp(`<${tag}[\\s>]`, 'gi');
        if (regex.test(html)) {
            patterns.push(`<${tag}> tag`);
        }
    }
    const eventHandlers = [
        'onclick', 'onerror', 'onload', 'onmouseover', 'onmouseout',
        'onfocus', 'onblur', 'onchange', 'onsubmit',
    ];
    for (const handler of eventHandlers) {
        const regex = new RegExp(`${handler}\\s*=`, 'gi');
        if (regex.test(html)) {
            patterns.push(`${handler} event handler`);
        }
    }
    const dangerousSchemes = ['javascript:', 'data:', 'vbscript:'];
    for (const scheme of dangerousSchemes) {
        if (html.toLowerCase().includes(scheme)) {
            patterns.push(`${scheme} URL scheme`);
        }
    }
    return patterns;
}
//# sourceMappingURL=html-sanitization.util.js.map