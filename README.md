# Data visualiser

Visualising and interpreting your survey or interview data.

[Open the student workspace](https://stefancouperus.github.io/data-visualiser/). Bring your own files or reopen a downloaded project. The visualisation workspace runs in the browser. Students enter their workshop code when using the Data bot.

## Use the workspace

1. **Upload.** Choose the Qualtrics or coded-interview shortcut, or bring a CSV/TSV, Excel workbook, Word document or text file. Choose an Excel sheet and its header row. In Qualtrics, export answer labels and retain the original headers.
2. **Check.** Inspect field types, ordered categories, units, blank answers and exclusions. Combine split select-all fields when needed. For Word, map comment or colour markings to codes, or choose delimiters for paragraph-level inline labels. For a coded spreadsheet, identify source, excerpt and code columns. Repeated code-assignment rows require a passage identifier to count the excerpt once. Taguette users can import English all-highlights DOCX exports or map spreadsheet columns. Confirm the complete source list when highlights omit uncoded documents.
3. **Explore.** Choose a question, compare groups, inspect counts and percentages or fit a guided regression. Read linked survey answers through the record view. From Check, convert an open-answer column into a collection retaining respondent attributes. To connect interview and participant files, import both and select **Link source information** in the text collection. Review source IDs and unmatched records.
4. **Compare.** Put two views alongside each other and choose whether to link filters. Coded passages, sources and respondents have distinct counting units. Open the underlying evidence before interpreting differences.
5. **Save and export.** Download an editable project with data, save it in this browser or export chart settings. Settings-only downloads require matching imports and omit passage text and source data. Use a full project to retain coding changes between workshops. Export either panel or the pair as SVG or PNG, or copy a figure.

Use **Download project with data** for a portable JSON file. On the start page, choose **Open a saved project** or drop the file there. The full project includes a dataset-specific bot activity record. Tick **Include full Data bot conversations** to save the questions and replies as well. Settings-only exports omit both. Older project downloads still open.

**Data bot.** The Worker sends the current summary and selected evidence to the university gateway, using Gemma as primary and Qwen as fallback. Review the context before adding whole sources. For suggested coding, select up to ten passages and approve or dismiss each grounded suggestion. Ordinary visualisation does not contact the gateway. Full project downloads include data and should be shared accordingly.

## Development and deployment

Use Node 22. Run `npm ci`, `npm run dev`, `npm test` and `npm run build`. Run the interaction checks with `npx playwright test`; install the Playwright Chromium browser on systems without the configured macOS Chrome. Browser test fixtures are synthetic and are not included in the landing page.

GitHub Actions builds the static site and deploys it to Pages from main. Set the GitHub repository variable `DATA_BOT_URL` to the HTTPS URL of the deployed Worker. Set GitHub Pages' build source to GitHub Actions. For local development, supply `VITE_BOT_URL` when starting Vite and use a local Worker with the local origin.

The relay lives in `worker/`. Its allowed web origin, rate limits and name are in `worker/wrangler.toml`. Deploy using `npx wrangler deploy --config worker/wrangler.toml`. Store `RUG_API_KEY`, `COURSE_CODE` and `SESSION_SECRET` as Cloudflare Worker secrets. Keep credentials outside Git and static build variables. Rotating the session secret invalidates existing twelve-hour sessions. Students can re-enter the same course code across workshops.

Edit `worker/data-bot.md` for shared instructions, and `worker/skills/` for task-specific teaching guidance. Redeploy the Worker after changing these files. Browser calculations supply figures and model output. Models suggest interpretations and changes for students to review.
