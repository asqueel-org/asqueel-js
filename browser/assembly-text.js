export const escapeHTML=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
// Existing plain-text notes remain plain in storage until the first visual edit.
export function noteHTML(value){
    return /^\s*<(?:p|div|h[1-6]|ul|ol|table|blockquote|strong|em|b|i|span|!doctype|html)(?:\s|>)/i.test(value??'')?value:`<p>${escapeHTML(value).replaceAll('\n','<br>')||'<br>'}</p>`;
}

// Empty rich-text scaffolding must not count as a written minute.
export function hasMinutesText(value){
    return !!String(value??'').replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,'')
        .replace(/<[^>]*>/g,'').replace(/&(?:nbsp|#0*160|#x0*a0);/gi,'').replace(/[\s\u200b\ufeff]/g,'');
}

// Display legacy rich notes as readable text; unchanged values keep their original storage.
export function noteText(value){
    const text=String(value??'');
    if(noteHTML(text)!==text)return text;
    const body=new DOMParser().parseFromString(text,'text/html').body;
    body.querySelectorAll('script,style,template').forEach(el=>el.remove());
    body.querySelectorAll('br').forEach(el=>el.replaceWith('\n'));
    body.querySelectorAll('p,div,h1,h2,h3,h4,h5,h6,li,tr,blockquote').forEach(el=>el.append('\n'));
    return body.textContent.replace(/\n{3,}/g,'\n\n').trim();
}
