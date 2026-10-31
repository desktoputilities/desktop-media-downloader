// Finished-file actions shared by Home, Downloads and History. When the file
// is gone (moved or deleted), they fall back to opening its folder.

export const openFolder = async (folderPath?: string) => {
    if (window.electronAPI?.openFolder) {
        await window.electronAPI.openFolder(folderPath);
        return;
    }

    if (window.electronAPI?.openDownloadsFolder) {
        await window.electronAPI.openDownloadsFolder();
    }
};

export const openFile = async (filePath?: string, folderPath?: string): Promise<boolean> => {
    if (filePath && window.electronAPI?.openFile) {
        const result = await window.electronAPI.openFile(filePath);
        if (result.success) return true;
    }
    await openFolder(folderPath);
    return false;
};

export const showFile = async (filePath?: string, folderPath?: string): Promise<boolean> => {
    if (filePath && window.electronAPI?.showFile) {
        const result = await window.electronAPI.showFile(filePath);
        if (result.success) return true;
    }
    await openFolder(folderPath);
    return false;
};
