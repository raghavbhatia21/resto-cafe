const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');

// 1. Build Menu
const MENU_DIR = path.join(__dirname, 'content', 'menu');
const MENU_OUTPUT = path.join(__dirname, 'menu.json');

function buildJson(sourceDir, outputFile, schemaMap) {
    if (!fs.existsSync(sourceDir)) {
        fs.mkdirSync(sourceDir, { recursive: true });
        return {};
    }

    const items = {};
    const files = fs.readdirSync(sourceDir);

    files.forEach(file => {
        if (!file.endsWith('.md')) return;

        const filePath = path.join(sourceDir, file);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const { data } = matter(fileContent);
        const id = file.replace('.md', '');

        if (data.available !== false && data.active !== false) {
            items[id] = schemaMap(id, data);
        }
    });

    fs.writeFileSync(outputFile, JSON.stringify(items, null, 2));
    console.log(`Generated ${path.basename(outputFile)} with ${Object.keys(items).length} items.`);
    return items;
}

buildJson(MENU_DIR, MENU_OUTPUT, (id, data) => ({
    id: id,
    name: data.title,
    price: data.price,
    category: data.category,
    description: data.description || '',
    image: data.image || '',
    available: data.available,
    variants: data.variants || []
}));

// 2. Build Offers
const OFFERS_DIR = path.join(__dirname, 'content', 'offers');
const OFFERS_OUTPUT = path.join(__dirname, 'offers.json');

buildJson(OFFERS_DIR, OFFERS_OUTPUT, (id, data) => ({
    id: id,
    title: data.title,
    description: data.description,
    tag: data.tag,
    image: data.image,
    active: data.active
}));

console.log(`Build complete!`);
