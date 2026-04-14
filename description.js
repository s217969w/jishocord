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
        desc += '\n※これはAIで作った説明で、未承認だよ。後で<コマンド>から承認か編集しておいてね。';
    }
    return desc;
}