with open('src/pages/CardsManagement.tsx', 'r') as f:
    content = f.read()

bad_str = """// Helper function for offline-safe writes
const safeWrite = async (promise: Promise<any>) => {
    if (!window.navigator.onLine) {
        promise.catch(e => console.warn('Offline write deferred', e));
        return Promise.resolve();
    }
    return Promise.race([
        promise,
        new Promise(resolve => setTimeout(resolve, 800)) // 800ms timeout for UI responsiveness
    ]);
};
"""

content = content.replace(bad_str, "")

with open('src/pages/CardsManagement.tsx', 'w') as f:
    f.write(content)

