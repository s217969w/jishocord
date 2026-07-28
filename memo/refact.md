# リファクタリング提案

## 調査条件

- 2026-07-28 時点の作業ツリーを対象とする。未コミットの変更も含む。
- 本書は現状の仕様を変えず、主に関数の責務を分離するための提案である。
- 小さい関数を機械的に増やすのではなく、重複の解消、単体テストのしやすさ、変更時の影響範囲の限定につながる箇所を優先する。
- 既存の `blueprint.md`、アプリケーションコード、マイグレーションには変更を加えない。

## 優先度: 高

### 1. 辞書操作の共通スコープ条件を関数化する

対象: `back/DB.ts` の `findInScope`、`approve`、`editWord`、`deleteWord`

現状は `scope` と `guildId` に応じた次の条件が複数箇所に直接記述されている。

- ローカル辞書: `scope = local` かつ `guild_id = context.guildId`
- パブリック辞書: `scope = public` かつ `guild_id IS NULL`

候補:

- `applyDictionaryScope(query, scope, guildId)`
- `validateScopeContext(scope, guildId)`

`findInScope` では `guildId` の有無からスコープを暗黙に決めている一方、更新系では `scope` を明示している。共通関数では `scope` と `guildId` を明示的に受け取り、ローカルなのに `guildId` がない状態を先に拒否する形が望ましい。

効果:

- 検索、承認、編集、削除でスコープ条件がずれる事故を防げる。
- Supabase のサービス用キーで RLS を迂回する構成でも、アプリ側の `guild_id` 条件を一箇所で維持できる。
- 「ローカルは対象サーバーのみ、パブリックは `guild_id IS NULL`」を単体テストしやすくなる。

### 2. 辞書の直接検索とエイリアス検索を分離する

対象: `back/DB.ts` の `findInScope`（161〜187行）

現在の関数は、直接一致の検索、エイリアス検索、関連行の形状確認、承認状態の確認、DB行からアプリ型への変換まで担当している。

候補:

- `findEntryByNormalizedWord(normalizedWord, scope, guildId)`
- `findEntryByAlias(normalizedAlias, scope, guildId)`
- `extractAliasedEntry(aliasResult)`

`findInScope` 自体は「直接一致を試し、なければエイリアスを試す」だけを組み立てる関数として残す。

効果:

- 直接検索とエイリアス検索を個別にテストできる。
- Supabase のリレーション結果が配列または単体になる場合の判定を、検索の制御フローから隔離できる。
- 将来エイリアスの優先順位や複数候補の扱いを変更しても、直接検索へ影響しにくい。

### 3. 承認・編集・削除の認可判定を共通化する

対象: `back/DB.ts` の `approve`、`editWord`、`deleteWord`

各関数に次の判定が重複している。

- ローカル操作に `guildId` が必要
- パブリック操作には `canApprovePublic` 相当の権限が必要

候補:

- `authorizeDictionaryManagement(context, scope, action)`

戻り値には `AppResult` と同じ判別可能な結果型を使い、操作名に応じた利用者向けメッセージだけを呼び出し側から渡すか、`action` から生成する。

なお、`canApprovePublic` という名前は編集・削除からも使用されているため、共通化時に `canManagePublicDictionary` など実際の責務に合う名前へ変更する。

効果:

- 操作を追加した際の認可漏れを防げる。
- 承認だけに見える関数を編集・削除でも使う、現在の命名上の誤解を解消できる。
- 認可失敗と Supabase 障害を区別する設計へ発展させやすい。

### 4. `interactionHandler` をコマンド別ハンドラへ分離する

対象: `front/command.ts` の `interactionHandler`（69〜110行）

現在はルーティング、オプション取得、入力オブジェクト組み立て、DB呼び出し、返信生成、例外時の返信を一つの関数が担当している。

候補:

- `handleApproveCommand(interaction)`
- `handleEditCommand(interaction)`
- `handleDeleteCommand(interaction)`
- `replyInteractionError(interaction, error)`
- `editDetailsFromInteraction(interaction)`

`interactionHandler` はコマンド名による振り分けと共通例外処理だけにする。コマンド定義は現状の配列のままでもよいが、コマンド数がさらに増える段階では定義とハンドラを同じ単位で管理するレジストリも検討する。

効果:

- 各コマンドの入力と返信を個別にテストできる。
- `edit` 固有のオプション変換が他コマンドの制御フローから外れる。
- ハンドラの分岐追加による見落としを減らせる。

### 5. `askAI` から「1回のAPI試行」と「再試行制御」を分離する

対象: `back/AI.ts` の `askAI`（57〜92行）

現在はクライアント生成、リクエスト構築、API呼び出し、応答解析、例外分類、再試行、待機、ログ記録を一つの関数が担当している。

候補:

- `requestExplanation(ai, word)` — 1回だけAPIを呼び、`AiResult` を返す
- `shouldRetry(result)`
- `retryDelayMs(attempt)`
- `runWithAiRetry(operation)` または AI 用に限定した同等関数

`parseResponse` と `classifyError` は既に分離されているため、その境界を活かす。外部APIを呼ぶ関数へクライアントを引数で渡せる形にすると、ネットワークを使わず再試行条件をテストできる。

効果:

- 「何を送るか」と「失敗時にどう再試行するか」を別々に検証できる。
- タイムアウトやレート制限だけを再試行する仕様が明確になる。
- 待機時間を実時間なしでテストできる。

## 優先度: 中

### 6. メンション経由の質問処理を `index.ts` から分離する

対象: `index.ts` の `MessageCreate` リスナー（49〜68行）

現在は Bot 宛て判定、メンション除去、空入力への応答、用語生成、結果からメッセージへの変換、Discord返信、例外処理がエントリーポイントに置かれている。

候補:

- `extractMentionedWord(message, botUserId)`
- `generateResultMessage(result)`
- `handleMentionedQuestion(message, botUserId)`

`index.ts` にはクライアント作成とイベント登録だけを残す。`generateResultMessage` はスラッシュコマンド側の結果表示とも共通化できるが、通常メッセージと Ephemeral 応答では送信方法が異なるため、文字列生成だけを共有する。

効果:

- Discordへ接続せず、メンション除去と結果表示をテストできる。
- エントリーポイントから業務処理を減らし、起動処理を読みやすくできる。

### 7. Guild 設定の初期化・退出イベント処理を分離する

対象: `index.ts` の `ClientReady`、`GuildCreate`、`GuildDelete` リスナー

`ensureGuildSettings` の呼び出しとエラー出力が起動時と参加時で重複している。

候補:

- `initializeGuildSettings(guildId)`
- `initializeCachedGuilds(guilds)`
- `recordGuildDeparture(guildId)`

起動時のコマンド登録と全Guild初期化も `handleClientReady` にまとめると、イベント登録部は宣言的になる。ただし現状の規模ではファイル分割まで行わず、まず同一ファイル内の関数抽出で十分である。

### 8. DB行変換を専用関数群へ揃える

対象: `back/DB.ts` の `toEntry` と `ensureGuildSettings`

`DictionaryRow` は `toEntry` で変換している一方、`GuildSettingsRow` は `ensureGuildSettings` 内で直接変換している。

候補:

- `toDictionaryEntry(row)`
- `toGuildSettings(row)`
- `toDictionaryInsert(input, context, scope)`
- `toDictionaryUpdates(editDetails)`

特に `addWord` の insert オブジェクトと `editWord` の update オブジェクトを純粋関数にすると、camelCase と snake_case の対応、正規化、`null` の扱いをDBなしで検証できる。

注意点として、プロジェクト規約では構造体を `interface.ts` に置くため、`DictionaryRow` と `GuildSettingsRow` の配置も同時に整理する。ただしDB固有型まで公開型にするかは、型の利用範囲を確認してから決める。

### 9. `makeReply` を段落生成と注記生成に分離する

対象: `front/commandHandler/ask.ts` の `makeReply`（47〜59行）

現状でも十分短いため優先度は高くないが、表示仕様のテストを細かくしたい場合は次の純粋関数へ分けられる。

- `makeHeading(entry)`
- `makeFormalNameLine(entry)`
- `makeApprovalNotice(status)`

最後に `neutralizeDiscordMentions` を一度だけ適用する現在の境界は維持する。関数数が増えるだけで変更容易性が上がらない段階では実施しない。

## 優先度: 低、または現時点では分離不要

### 10. コマンド定義のビルダー分割

対象: `front/command.ts` の `commands`

`buildAskCommand`、`buildEditCommand` などへ分けることは可能だが、定義は宣言的で副作用もなく、現時点では一覧性の方が高い。コマンド数が増える、権限定義が複雑になる、定義とハンドラの対応漏れが起きる、のいずれかが発生してから分離する。

### 11. 小規模な純粋関数

対象: `back/validation.ts`、`back/logger.ts`、`front/commandHandler/unapproved.ts`

これらは既に責務が限定されている。`normalizeWord`、`neutralizeDiscordMentions`、ログ関数、未承認一覧の整形をさらに細分化しても、現状では効果が小さい。未承認一覧にページングや文字数制御を追加する時点で、一覧文字列を作る純粋関数を抽出する。

### 12. SQLトリガー関数

対象: `supabase/migrations/20260727133821_phase_0_1_foundation.sql`

`set_updated_at`、`enforce_local_entry_limit`、`enforce_alias_consistency`、`audit_dictionary_change` は既に目的別の関数に分かれている。過去のマイグレーションをリファクタリング目的で書き換えるべきではない。仕様変更や不具合修正が必要になった場合のみ、新しいマイグレーションで変更する。

## 推奨する実施順

1. `applyDictionaryScope` と `validateScopeContext` を抽出し、検索・更新のスコープ条件をテストする。
2. 管理操作の認可判定を `authorizeDictionaryManagement` に集約する。
3. `findInScope` を直接検索とエイリアス検索へ分ける。
4. DBへの insert/update オブジェクト生成を純粋関数化する。
5. `interactionHandler` をコマンド別に分ける。
6. `askAI` の1回の試行と再試行制御を分ける。
7. `index.ts` のメッセージ処理とGuildイベント処理を分ける。

各段階で既存テストを通し、抽出した純粋関数または境界関数のテストを追加する。特にスコープ条件、管理権限、AI再試行は、リファクタリング前に現行挙動を固定するテストを用意してから着手する。
