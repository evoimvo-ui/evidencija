const fs = require('fs');
const path = require('path');

const langDir = path.join(__dirname, 'lang');
const enPath = path.join(langDir, 'en.json');
const bsPath = path.join(langDir, 'bs.json');

const en = JSON.parse(fs.readFileSync(enPath, 'utf8'));
const bs = JSON.parse(fs.readFileSync(bsPath, 'utf8'));

// Sync bs.json with en.json first if needed
let bsChanged = false;
for (const key in en) {
    if (!bs[key]) {
        bs[key] = en[key];
        bsChanged = true;
    }
}
if (bsChanged) {
    fs.writeFileSync(bsPath, JSON.stringify(bs, null, 4), 'utf8');
    console.log('bs.json updated with missing keys from en.json');
}

const files = fs.readdirSync(langDir);

files.forEach(file => {
    if (file.endsWith('.json') && file !== 'en.json' && file !== 'bs.json') {
        const filePath = path.join(langDir, file);
        const current = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        let changed = false;

        // Add missing keys
        for (const key in en) {
            if (!current.hasOwnProperty(key)) {
                current[key] = en[key];
                changed = true;
            }
        }

        // Remove extra keys that are not in en.json (to keep it clean)
        for (const key in current) {
            if (!en.hasOwnProperty(key)) {
                delete current[key];
                changed = true;
            }
        }

        // Sort keys to match en.json order
        const sorted = {};
        Object.keys(en).forEach(key => {
            sorted[key] = current[key];
        });

        if (changed || JSON.stringify(current) !== JSON.stringify(sorted)) {
            fs.writeFileSync(filePath, JSON.stringify(sorted, null, 4), 'utf8');
            console.log(`Updated ${file}`);
        }
    }
});
