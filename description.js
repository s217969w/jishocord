// データを元に説明文を組み立てる
export async function description(data) {
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
    if(data.is_approved === false) {
        desc += `\n※これはAIで作った説明で、未承認だよ。\n
        この説明で大丈夫なら\`/approve\`から承認しておいてね。\n
        もし間違ってたら\`/edit\`から教えて。`;
    }
    return desc;
}