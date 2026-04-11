export function description(data) {
    let desc = "";
    desc += data.word;
    desc += '【' + data.pronounce + '】\n\n';
    if(data.fullWord != null) {
        desc += data.fullWord;
        if(data.Japanese != null) desc += ', ' + data.Japanese;
        desc += '\n\n';
    }
    desc += data.summary + '\n';
    desc += data.detail;
    return desc;
}