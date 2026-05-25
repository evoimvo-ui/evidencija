const fs = require('fs');
const path = require('path');

const langDir = path.join(__dirname, 'lang');
const bsPath = path.join(langDir, 'bs.json');
const bs = JSON.parse(fs.readFileSync(bsPath, 'utf8'));
const bsKeys = Object.keys(bs);

const files = fs.readdirSync(langDir).filter(f => f.endsWith('.json'));

files.forEach(file => {
    if (file === 'bs.json' || file === 'en.json') return;
    
    const filePath = path.join(langDir, file);
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    let changed = false;

    // 1. Add missing keys from bs.json
    bsKeys.forEach(key => {
        if (!content.hasOwnProperty(key)) {
            content[key] = bs[key];
            changed = true;
        }
    });

    // 2. Remove extra keys not in bs.json
    Object.keys(content).forEach(key => {
        if (!bs.hasOwnProperty(key)) {
            delete content[key];
            changed = true;
        }
    });

    // 3. Ensure order matches bs.json
    const sortedContent = {};
    bsKeys.forEach(key => {
        sortedContent[key] = content[key];
    });

    // Write back if changed or order mismatch
    if (changed || JSON.stringify(Object.keys(content)) !== JSON.stringify(bsKeys)) {
        fs.writeFileSync(filePath, JSON.stringify(sortedContent, null, 4), 'utf8');
        console.log(`Synced structure for ${file}`);
    }
});
