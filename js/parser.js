const EMAIL_RE = /[\w.-]+@[\w.-]+\.\w+/;
const URL_RE = /(?:https?:\/\/|www\.)\S+/i;
const ZIP_RE = /〒?\s*(\d{3}-?\d{4})/;
const PHONE_RE = /0\d{1,4}-?\d{1,4}-?\d{4}/g;
const MOBILE_RE = /0(?:70|80|90)-?\d{4}-?\d{4}/g;
const COMPANY_RE = /株式会社|\(株\)|有限会社|Inc\.|Corp\.|Ltd\.|Co\.,/i;
const DEPT_RE = /部|課|室|グループ|Division|Department/i;
const TITLE_RE = /代表取締役|社長|CEO|CTO|COO|部長|課長|室長|マネージャー|Director|Manager|Lead|エンジニア/i;
const KANA_RE = /^[ァ-ヴー・\s]+$/;
const KANJI_NAME_RE = /^[\u4E00-\u9FFF\u3400-\u4DBF]{2,5}$/;

function extractEmail(line) {
  const m = line.match(EMAIL_RE);
  return m ? m[0] : null;
}

function extractUrl(line) {
  const m = line.match(URL_RE);
  return m ? m[0] : null;
}

function extractZip(line) {
  const m = line.match(ZIP_RE);
  return m ? m[1].replace(/(\d{3})(\d{4})/, '$1-$2') : null;
}

function normalizePhone(raw) {
  return raw.replace(/\s/g, '');
}

function classifyPhones(lines, used) {
  const result = { tel: '', fax: '', mobile: '' };
  const usedPhones = new Set();

  lines.forEach((line, i) => {
    const prev = i > 0 ? lines[i - 1] : '';
    const phones = line.match(PHONE_RE) || [];
    phones.forEach((raw) => {
      const phone = normalizePhone(raw);
      const key = `${i}:${phone}`;
      if (usedPhones.has(key)) return;

      if (MOBILE_RE.test(phone)) {
        if (!result.mobile) {
          result.mobile = phone;
          usedPhones.add(key);
          used.add(i);
        }
        return;
      }

      if (/FAX|Fax/i.test(prev) || /FAX|Fax/i.test(line)) {
        if (!result.fax) {
          result.fax = phone;
          usedPhones.add(key);
          used.add(i);
        }
        return;
      }

      if (/TEL|Tel|☎/.test(prev) || /TEL|Tel|☎/.test(line)) {
        if (!result.tel) {
          result.tel = phone;
          usedPhones.add(key);
          used.add(i);
        }
        return;
      }
    });
  });

  lines.forEach((line, i) => {
    if (used.has(i)) return;
    const phones = line.match(PHONE_RE) || [];
    phones.forEach((raw) => {
      const phone = normalizePhone(raw);
      const key = `${i}:${phone}`;
      if (usedPhones.has(key)) return;

      if (MOBILE_RE.test(phone) && !result.mobile) {
        result.mobile = phone;
        usedPhones.add(key);
        used.add(i);
      } else if (!result.tel) {
        result.tel = phone;
        usedPhones.add(key);
        used.add(i);
      } else if (!result.fax) {
        result.fax = phone;
        usedPhones.add(key);
        used.add(i);
      }
    });
  });

  return result;
}

export function parseOcrText(rawText) {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const used = new Set();
  const fields = {
    company: '',
    department: '',
    title: '',
    name: '',
    nameKana: '',
    zip: '',
    address: '',
    tel: '',
    fax: '',
    mobile: '',
    email: '',
    url: '',
    other: [],
  };

  let titleLineIndex = -1;
  let zipLineIndex = -1;

  lines.forEach((line, i) => {
    if (used.has(i)) return;

    const email = extractEmail(line);
    if (email && !fields.email) {
      fields.email = email;
      used.add(i);
      return;
    }

    const url = extractUrl(line);
    if (url && !fields.url) {
      fields.url = url;
      used.add(i);
      return;
    }

    const zip = extractZip(line);
    if (zip && !fields.zip) {
      fields.zip = zip;
      zipLineIndex = i;
      used.add(i);
      return;
    }
  });

  if (zipLineIndex >= 0 && zipLineIndex + 1 < lines.length && !used.has(zipLineIndex + 1)) {
    const next = lines[zipLineIndex + 1];
    if (/都|道|府|県/.test(next)) {
      fields.address = next;
      used.add(zipLineIndex + 1);
    }
  }

  lines.forEach((line, i) => {
    if (used.has(i)) return;
    if (fields.address) return;
    if (/都|道|府|県/.test(line)) {
      fields.address = line;
      used.add(i);
    }
  });

  const phones = classifyPhones(lines, used);
  fields.tel = phones.tel;
  fields.fax = phones.fax;
  fields.mobile = phones.mobile;

  lines.forEach((line, i) => {
    if (used.has(i)) return;
    if (COMPANY_RE.test(line) && !fields.company) {
      fields.company = line;
      used.add(i);
    }
  });

  lines.forEach((line, i) => {
    if (used.has(i)) return;
    if (DEPT_RE.test(line) && !fields.department) {
      fields.department = line;
      used.add(i);
    }
  });

  lines.forEach((line, i) => {
    if (used.has(i)) return;
    if (TITLE_RE.test(line) && !fields.title) {
      fields.title = line;
      titleLineIndex = i;
      used.add(i);
    }
  });

  lines.forEach((line, i) => {
    if (used.has(i)) return;
    if (KANA_RE.test(line) && /[ァ-ヴ]/.test(line) && !fields.nameKana) {
      fields.nameKana = line;
      used.add(i);
    }
  });

  if (titleLineIndex >= 0 && titleLineIndex + 1 < lines.length && !used.has(titleLineIndex + 1)) {
    const next = lines[titleLineIndex + 1];
    if (KANJI_NAME_RE.test(next) && !fields.name) {
      fields.name = next;
      used.add(titleLineIndex + 1);
    }
  }

  lines.forEach((line, i) => {
    if (used.has(i)) return;
    if (KANJI_NAME_RE.test(line) && !fields.name) {
      fields.name = line;
      used.add(i);
    }
  });

  lines.forEach((line, i) => {
    if (!used.has(i)) fields.other.push(line);
  });

  return { ...fields, rawOcrText: rawText };
}
