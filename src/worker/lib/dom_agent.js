// DOM-aware action generator for Janhit
// Produces a structured JSON action describing highlight/answer/fill/scroll/focus/click/none

function sanitizeText(value) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

function findBestElement(elements, needle) {
  if (!Array.isArray(elements) || !needle) return null;
  const key = needle.toLowerCase();
  // Score candidates by label/name/text/includes order
  let best = null;
  let bestScore = 0;

  for (const el of elements) {
    const label = sanitizeText(el.label || el.name || el.text || '');
    const hay = (label + ' ' + (el.placeholder || '') + ' ' + (el.role || '')).toLowerCase();
    let score = 0;
    if (!hay) continue;
    if (hay === key) score += 10;
    if (hay.includes(key)) score += 6;
    // token matches
    const tokens = key.split(/\s+/).filter(Boolean);
    for (const t of tokens) {
      if (hay.includes(t)) score += 1;
    }

    if (score > bestScore) {
      bestScore = score;
      best = el;
    }
  }

  return best;
}

function extractQuoted(text) {
  const m = text.match(/"([^"]+)"|'([^']+)'/);
  return m ? (m[1] || m[2]) : null;
}

function extractEmail(text) {
  const m = text.match(/([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})/i);
  return m ? m[1] : null;
}

function extractPhone(text) {
  const m = text.match(/(?:\+91[-\s]?)?[6-9]\d{9}\b/);
  return m ? m[0] : null;
}

/**
 * Generate DOM action JSON per user spec.
 * params: { transcript, language, page_url, page_title, dom_snapshot, interactive_elements, user_profile }
 */
export function generateDomAction(params) {
  const transcript = sanitizeText(params.transcript || '');
  const lang = sanitizeText(params.detected_language || params.language || 'en');
  const page = params.dom_snapshot || {};
  const interactive = Array.isArray(params.interactive_elements) ? params.interactive_elements : (page.elements || []);
  const profile = params.user_profile || {};

  const lower = transcript.toLowerCase();

  // Determine intent
  let action = 'none';
  if (/(highlight|show me|point to|where is|locate|find)/i.test(transcript)) action = 'highlight';
  else if (/(what|who|where|when|how|describe|tell me)/i.test(transcript) && !/(click|fill|type|enter|scroll|focus)/i.test(transcript)) action = 'answer_question';
  else if (/(fill|enter|type|set|populate|autofill)/i.test(transcript)) action = 'fill_form';
  else if (/(scroll|go to|bring me to)/i.test(transcript)) action = 'scroll';
  else if (/(focus|focus on|put cursor|focus the)/i.test(transcript)) action = 'focus';
  else if (/(click|press|tap|submit|open|next)/i.test(transcript)) action = 'click';

  const result = {
    spoken_text: '',
    action,
    target_selector: null,
    fills: [],
    scroll_first: false,
    follow_up: null,
  };

  // Helper to build selector preference
  function bestSelectorFor(el) {
    if (!el) return null;
    if (el.selector) return el.selector;
    if (el.id) return `#${el.id}`;
    if (el.name) return `[name="${el.name}"]`;
    return null;
  }

  // Answer question: summarize from page
  if (action === 'answer_question') {
    const title = sanitizeText(params.page_title || page.title || 'this page');
    const snippet = sanitizeText(page.visibleText || '').split('\n').map(s=>s.trim()).filter(Boolean).slice(0,6).join(' ');
    if (snippet) {
      result.spoken_text = snippet.length > 400 ? snippet.slice(0,400) : snippet;
    } else if (title) {
      result.spoken_text = `This page appears to be titled ${title}.`;
    } else {
      result.spoken_text = `I don't have enough visible information on this page to answer that.`;
    }
    result.action = 'answer_question';
    result.target_selector = null;
    result.scroll_first = false;
    result.follow_up = 'Do you want me to highlight a section or find a specific field?';
    return result;
  }

  // For element-targeting actions, attempt to find best element
  const targetHint = (() => {
    // Try quoted text, then key phrases
    const q = extractQuoted(transcript);
    if (q) return q;
    // common phrases like 'submit button', 'email field'
    const candidates = transcript.match(/(?:the\s)?([\w\s'-]{2,60})(?: button| link| field| input| section| area| form)?/i);
    if (candidates && candidates[1]) return candidates[1].trim();
    return transcript.split(/[.,?]/)[0];
  })();

  const best = findBestElement(interactive, targetHint || transcript);
  if (!best) {
    result.action = 'none';
    result.spoken_text = `I couldn't find an element matching "${targetHint || transcript}" on this page. Could you describe it differently?`;
    result.follow_up = 'Can you describe the element by its label or visible text?';
    return result;
  }

  const selector = bestSelectorFor(best) || best.selector || null;
  const offscreen = best.rect && (best.rect.y > (params.viewport?.height || 800) || best.rect.x > (params.viewport?.width || 1200));

  if (action === 'highlight') {
    result.action = 'highlight';
    result.spoken_text = `I found ${best.label || best.text || 'the element'} and will highlight it.`;
    result.target_selector = selector;
    result.scroll_first = !!offscreen;
    result.follow_up = 'Do you want me to focus or click it?';
    return result;
  }

  if (action === 'scroll') {
    result.action = 'scroll';
    result.spoken_text = `I will scroll to ${best.label || best.text || 'the element'}.`;
    result.target_selector = selector;
    result.scroll_first = true;
    result.follow_up = null;
    return result;
  }

  if (action === 'focus') {
    result.action = 'focus';
    result.spoken_text = `I will focus ${best.label || best.placeholder || 'the input'}.`;
    result.target_selector = selector;
    result.scroll_first = !!offscreen;
    return result;
  }

  if (action === 'click') {
    // simple safety: allow only safe labelled actions unless explicit
    const dangerous = /(delete|remove|cancel|close|danger|destroy)/i;
    if (dangerous.test(best.label || best.text || '')) {
      result.action = 'none';
      result.spoken_text = `That button looks potentially destructive (${best.label || best.text}). Please confirm before I click.`;
      result.follow_up = 'Do you want me to click it?';
      return result;
    }

    result.action = 'click';
    result.spoken_text = `I will click ${best.label || best.text || 'the element'} for you.`;
    result.target_selector = selector;
    result.scroll_first = !!offscreen;
    return result;
  }

  if (action === 'fill_form') {
    // Decide fills using profile and transcript
    const fills = [];
    // gather possible fills: email, phone, quoted text
    const email = extractEmail(transcript) || profile.email || null;
    const phone = extractPhone(transcript) || profile.phone || null;
    const quoted = extractQuoted(transcript);

    // Try to map best element if it's an input
    if (best && best.type && ['text','email','tel','textarea','search'].includes((best.type||'').toLowerCase())) {
      const value = email && best.type === 'email' ? email : (phone && best.type === 'tel' ? phone : (quoted || profile[best.name] || profile[best.label] || ''));
      if (value) {
        fills.push({ selector: selector, value: String(value), confidence: 0.9, reason: `Matched field ${best.label || best.name} from transcript/profile` });
      }
    }

    // If no fills but profile available, try mapping common names
    if (fills.length === 0 && profile) {
      const mapping = [
        { key: 'name', selMatch: ['name','full','your name'] },
        { key: 'email', selMatch: ['email','e-mail'] },
        { key: 'phone', selMatch: ['phone','mobile','contact'] },
      ];
      for (const m of mapping) {
        if (!profile[m.key]) continue;
        const candidate = interactive.find((el) => {
          const hay = ((el.label||'')+' '+(el.name||'')+' '+(el.placeholder||'')).toLowerCase();
          return m.selMatch.some(s => hay.includes(s));
        });
        if (candidate) {
          fills.push({ selector: bestSelectorFor(candidate) || candidate.selector || null, value: String(profile[m.key]), confidence: 0.95, reason: `From user_profile.${m.key}` });
        }
      }
    }

    if (fills.length === 0) {
      result.action = 'none';
      result.spoken_text = `I couldn't determine what to fill from your request. Could you tell me which field to fill or provide the value?`;
      result.follow_up = 'Which field would you like me to fill?';
      return result;
    }

    result.action = 'fill_form';
    result.spoken_text = `I prepared ${fills.length} field(s) to fill.`;
    result.fills = fills;
    result.target_selector = null;
    result.scroll_first = false;
    result.follow_up = 'Do you want me to fill these fields now?';
    return result;
  }

  // fallback
  result.action = 'none';
  result.spoken_text = `I couldn't map your request to an action on this page. Please clarify.`;
  result.follow_up = 'Can you be more specific?';
  return result;
}

export default { generateDomAction };
