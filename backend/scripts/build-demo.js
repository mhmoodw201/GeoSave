// scripts/build-demo.js
// يبني نسخة تجريبية من GeoSave في ملف HTML واحد (بدون خادم) — للتصفح والعرض فقط.
// التشغيل:  npm run build:demo   → dist/geosave-demo.html

const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..', '..');
const frontend = path.join(root, 'frontend');
const outFile = path.join(root, 'dist', 'geosave-demo.html');

const read = (file) => fs.readFileSync(path.join(frontend, file), 'utf8');
const pick = (html, regex) => {
    const match = html.match(regex);
    if (!match) throw new Error(`Pattern not found: ${regex}`);
    return match;
};
// مراجع الأيقونات تصبح داخلية في الملف الواحد
const inlineIcons = (html) => html.replace(/\/assets\/icons\.svg#([\w-]+)/g, '#i-$1');

async function main() {
    const pages = ['index.html', 'login.html', 'register.html', 'add-product.html', 'account.html'];
    const templates = {};
    for (const page of pages) {
        const html = read(page);
        templates[`/${page}`] = {
            title: pick(html, /<title>([^<]*)<\/title>/)[1],
            bodyClass: pick(html, /<body class="([^"]*)">/)[1],
            main: inlineIcons(pick(html, /<main[\s\S]*?<\/main>/)[0]),
        };
    }
    const index = read('index.html');
    const header = inlineIcons(pick(index, /<a class="skip-link"[\s\S]*?<\/header>/)[0]);
    const footer = inlineIcons(pick(index, /<footer[\s\S]*?<\/footer>/)[0]);

    const sprite = read('assets/icons.svg')
        .replace(/<!--[\s\S]*?-->/g, '')
        .replace(/id="([\w-]+)"/g, 'id="i-$1"')
        .replace('<svg xmlns="http://www.w3.org/2000/svg">', '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true">');

    // الخط من Google Fonts (المسموح في النسخة المستضافة) بدل الملفات المحلية
    const css = read('assets/css/styles.css').replace(/\/\* =+\s*\n\s*الخط:[\s\S]*?(?=\/\* =+\s*\n\s*GeoSave)/, '');

    const bundle = await esbuild.build({
        entryPoints: [path.join(frontend, 'demo', 'demo-app.js')],
        bundle: true,
        format: 'iife',
        target: ['es2020'],
        minify: true,
        write: false,
        banner: { js: 'window.__GEOSAVE_SPA__={};' },
        legalComments: 'none',
    });
    const js = bundle.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');

    const html = `<title>GeoSave</title>
<meta name="description" content="GeoSave — استأجر ما تحتاجه من جيرانك (نسخة تجريبية)">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&display=swap">
<style>${css}
html { direction: rtl; }
</style>
${sprite}
${header}
<main id="main"></main>
${footer}
<script>window.__GEOSAVE_TEMPLATES__=${JSON.stringify(templates).replace(/</g, '\\u003c')};</script>
<script>${js}</script>
`;
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, html);
    console.log(`Demo written to ${path.relative(root, outFile)} (${(html.length / 1024).toFixed(0)} KB)`);
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
