import fs from 'fs';
import path from 'path';

function walk(dir: string): string[] {
    let results: string[] = [];
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        file = path.join(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) { 
            results = results.concat(walk(file));
        } else { 
            if (file.endsWith('.tsx')) {
                results.push(file);
            }
        }
    });
    return results;
}

const files = walk('src');

files.forEach(file => {
    let content = fs.readFileSync(file, 'utf8');
    
    // Check if it has a back button with ArrowLeft or ChevronRight
    const regex1 = /<button[^>]*onClick=\{[^}]*navigate[^}]*\}[^>]*>[\s\S]*?<ArrowLeft[^>]*size=\{?24\}?[^>]*>[\s\S]*?<\/button>\s*/g;
    const regex2 = /<Link[^>]*to=\{?[^}]+\}?[^>]*>[\s\S]*?<ArrowLeft[^>]*size=\{?24\}?[^>]*>[\s\S]*?<\/Link>\s*/g;
    const regex3 = /<Link[^>]*to=\{?[^}]+\}?[^>]*>[\s\S]*?[^>]*رجوع[^>]*[\s\S]*?<ChevronRight[^>]*size=\{?18\}?[^>]*>[\s\S]*?<\/Link>\s*/g;
    const regex4 = /<div className="mr-auto">[\s\S]*?<Link[^>]*to=\{?[^}]+\}?[^>]*>[\s\S]*?<ChevronRight[^>]*size=\{?18\}?[^>]*>[\s\S]*?<\/Link>[\s\S]*?<\/div>/g;
    const regex5 = /<button[^>]*onClick=\{[^}]*navigate[^}]*\}[^>]*>[\s\S]*?<ArrowLeft[^>]*size=\{?20\}?[^>]*>[\s\S]*?<\/button>\s*/g;
    const regex6 = /<Link[^>]*to="\/settings"[^>]*>[\s\S]*?<ChevronRight[^>]*>[\s\S]*?<\/Link>\s*/g;
    const regex7 = /<button[^>]*onClick=\{[^}]*goBack[^}]*\}[^>]*>[\s\S]*?<ArrowLeft[^>]*size=\{?24\}?[^>]*>[\s\S]*?<\/button>\s*/g;

    const oldContent = content;
    content = content.replace(regex1, '');
    content = content.replace(regex2, '');
    content = content.replace(regex3, '');
    content = content.replace(regex4, '');
    content = content.replace(regex5, '');
    content = content.replace(regex6, '');
    content = content.replace(regex7, '');

    if (oldContent !== content) {
        fs.writeFileSync(file, content);
        console.log('Updated ' + file);
    }
});
