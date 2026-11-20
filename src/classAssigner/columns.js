const {
    HEADER_ALIASES,
    REQUIRED_HEADERS,
    TARGET_COLUMNS
} = require('./constants');

function cleanHeader(value) {
    return String(value == null ? '' : value).trim();
}

function findHeaderRowIndex(rows) {
    return rows.findIndex(row => Array.isArray(row) && row.some(cell => cleanHeader(cell) !== ''));
}

function mapHeaders(headerRow) {
    const headers = (headerRow || []).map(cleanHeader);
    const duplicates = [];
    const seen = new Map();
    for (let index = 0; index < headers.length; index += 1) {
        const name = headers[index];
        if (!name) continue;
        if (seen.has(name)) duplicates.push(name);
        else seen.set(name, index);
    }

    const idIndex = headers.indexOf('身份证号码');
    const aliasIndex = headers.indexOf('身份证号');
    if (idIndex !== -1 && aliasIndex !== -1) {
        duplicates.push('身份证号码/身份证号');
    }

    const index = {};
    for (const [alias, canonical] of Object.entries(HEADER_ALIASES)) {
        const position = headers.indexOf(alias);
        if (position !== -1 && index[canonical] === undefined) index[canonical] = position;
    }
    for (let position = 0; position < headers.length; position += 1) {
        const name = headers[position];
        if (name && index[name] === undefined) index[name] = position;
    }

    const missing = REQUIRED_HEADERS.filter(name => index[name] === undefined);
    return { headers, index, duplicates, missing };
}

function getCell(row, headerMap, name) {
    const position = headerMap.index[name];
    if (position === undefined || !Array.isArray(row)) return '';
    const value = row[position];
    return value == null ? '' : value;
}

function buildOutputLayout(headerMap, { addNumber }) {
    const headers = headerMap.headers.slice();
    const index = {};
    for (let position = 0; position < headers.length; position += 1) {
        const name = headers[position];
        if (name && index[name] === undefined) index[name] = position;
    }

    const appended = [];
    if (addNumber && index['编号'] === undefined) appended.push('编号');
    for (const name of TARGET_COLUMNS) {
        if (index[name] === undefined) appended.push(name);
    }
    for (const name of appended) {
        index[name] = headers.length;
        headers.push(name);
    }
    return { headers, index, appended };
}

module.exports = {
    cleanHeader,
    findHeaderRowIndex,
    mapHeaders,
    getCell,
    buildOutputLayout
};
