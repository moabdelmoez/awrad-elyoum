# بداية الهداية

An Arabic iPhone PWA for the seven routines in [ورد.md](../ورد.md). The
static files in `dist/` are the deployable site.

From the workspace root, run `python3 site/build.py` after editing the
Markdown or reader assets. To preview locally, serve `site/dist` with
`python3 -m http.server 8765 --bind 127.0.0.1 --directory site/dist`.

On iPhone, open the HTTPS site in Safari and choose **Add to Home Screen**.
Launch from the new icon once while online. **خيارات القراءة** shows when
the reading material is available offline.

Prayer times come from the [AlAdhan Cairo calendar](https://aladhan.com/prayer-times-api).
The bundled supplementary Uthmani passages come from the [Quran.com API](https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number=112).

The visual polish used [Unslop](https://heydamir.design/unslop) by Damir Sokolovsky (CC BY 4.0).

[IBM Plex Sans Arabic](https://github.com/IBM/plex/tree/master/packages/plex-sans-arabic) is bundled locally under the [SIL Open Font License](dist/fonts/OFL.txt).
