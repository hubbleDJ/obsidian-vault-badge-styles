# Vault Badge Styles: технический контекст

Этот файл нужен как краткая карта проекта для будущих правок. Его можно читать перед небольшими задачами вместо полного повторного изучения `main.js`.

## Что делает плагин

`Vault Badge Styles` кастомизирует визуальный вид сущностей Obsidian как компактные плашки:

- папки в дереве файлов;
- файлы любого формата;
- заголовки вкладок;
- внутренние ссылки на заметки;
- внешние ссылки;
- значения свойств;
- значения в Bases/таблицах и похожих панелях;
- mentions/backlinks и другие места, где Obsidian рендерит ссылки или свойства.

Плагин не переписывает Markdown. Почти вся логика работает как render-layer: DOM размечается классами, `data-*` атрибутами и inline CSS variables.

## Главная идея дизайна

Правила задаются в настройках плагина, а не во frontmatter заметок. Это важно, чтобы:

- не засорять сами заметки настройками внешнего вида;
- переиспользовать одну систему для дерева файлов, ссылок, свойств и Bases;
- синхронизировать поведение между personal и Avito vault через настройки плагина.

## Основные файлы

- `main.js` - весь код плагина, включая настройки, рендереры, модалки, resolver и команды.
- `styles.css` - базовые стили плашек, иконок, UI настроек и служебных классов.
- `manifest.json` - manifest Obsidian plugin. `id`: `vault-badge-styles`.
- `versions.json` - версии для BRAT/Obsidian.
- `README.md` - пользовательское описание на русском.
- `PLUGIN_CONTEXT.md` - этот технический файл.

В проекте нет сборки через `npm`/`esbuild`: публикуются напрямую `main.js`, `manifest.json`, `styles.css`.

## Схема настроек

`DEFAULT_SETTINGS` находится в начале `main.js`.

Основные поля:

- `iconSearchPaths` - папки vault, где искать файлы иконок.
- `iconSize` - размер иконки по умолчанию.
- `linkIconSize` - размер иконки в ссылках.
- `fileExplorerIconSize` - размер иконки в дереве файлов.
- `folderRules` - правила каталогов.
- `fileRules` - правила файлов.
- `externalLinkRules` - правила внешних ссылок.
- `propertyValueRules` - правила значений свойств.
- `enableFileExplorer` - рендер в дереве файлов.
- `enableTabHeaders` - рендер в заголовках вкладок.
- `enableReadingViewLinks` - рендер ссылок в Reading View.
- `enableLivePreviewLinks` - задел под Live Preview. Сейчас полноценная CodeMirror-реализация не сделана.
- `enableGenericInternalLinks` - рендер в generic-панелях Obsidian: backlinks, mentions, Bases и похожие места.
- `enablePropertyValues` - рендер значений свойств.
- `enableShortenInternalLinks` - сокращать пути внутренних ссылок в Reading View.
- `enableShortenTags` - сокращать вложенные теги в Reading View.
- `enableTagStyleInternalLinks` - показывать внутренние ссылки как теги.
- `enableTagStyleExternalLinks` - показывать внешние ссылки как теги.
- `enableTagStyleFileExplorer` - показывать дерево файлов как теги.
- `enableTagStyleLivePreviewLinks` - задел под теговый вид в Live Preview.
- `enableTagStylePropertyValues` - показывать значения свойств как теги.
- `autoUpdateRulePathsOnRename` - обновлять пути правил при rename/move внутри Obsidian.
- `tagBackgroundOpacity` - общая прозрачность фона плашек.

## Типы правил

### Правило каталога

Используется для папок и, если включен `cascade`, для вложенных элементов.

Ключевые поля:

- `type: "folder"`;
- `path` - первый путь папки от корня vault;
- `paths` - дополнительные пути папок с тем же стилем;
- `cascade` - применять к вложенным файлам и папкам;
- `iconSource` - источник иконки: файл или emoji/текст;
- `icon` - имя/путь иконки или emoji/текст;
- `textColor` - цвет текста;
- `backgroundColor` - цвет фона плашки;
- `fillBackground` - заливать ли фон плашки;
- `iconColorMode` - режим цвета SVG-иконки;
- `iconColor` - кастомный цвет SVG-иконки.

### Правило файла

Применяется к точному пути файла любого формата.

Ключевые поля такие же, как у правила каталога, но:

- `type: "file"`;
- `path` - первый точный путь файла, например `main.md`, `Project tasks.base`, `image.png`;
- `paths` - дополнительные точные пути файлов с тем же стилем;
- нет каскада.

Файловое правило сильнее каскадного правила папки.

### Правило внешней ссылки

Применяется, если `href` начинается с указанного префикса.

Ключевые поля:

- `prefix` - первый префикс, например `tg://`, `tel:`, `https://vk.com/`;
- `prefixes` - дополнительные URL-префиксы с тем же стилем;
- остальные поля стиля такие же: иконка, цвет текста, цвет фона, заливка, цвет SVG.

Если подходит несколько правил, выбирается самое длинное совпадение по `prefix`.

### Правило значения свойства

Применяется к конкретной паре `property + value`.

Ключевые поля:

- `property` - имя свойства первой пары, например `Task status`;
- `value` - значение первой пары, например `done`;
- `pairs` - дополнительные пары `{ property, value }` с тем же стилем;
- остальные поля стиля такие же.

Это не глобальное правило по значению. `Task status = done` и `Phase = done` могут иметь разные стили.

## Приоритеты правил

- Файл по точному пути сильнее папочного каскада.
- Более конкретная вложенная папка сильнее родительской.
- Для внешних ссылок самый длинный `prefix` сильнее короткого.
- Для свойств матчится точная пара `property + value`.
- Один визуальный rule может разворачиваться в несколько matcher-ов: `paths`, `prefixes` или `pairs`.
- Если правило найдено, стиль собирается в единый объект и применяется конкретным renderer-ом.

## Иконки

Иконки поддерживаются в двух режимах:

- файл из vault;
- emoji/любой короткий текст.

Файловые иконки ищутся в папках `iconSearchPaths`.

Поддерживаемые форматы:

- SVG;
- PNG;
- WebP;
- JPG;
- JPEG.

Если в настройке указано имя без расширения, сохраняется обратная совместимость: сначала ищется SVG по старой логике, например `golang.svg` или `golang/golang.svg` в папках поиска.

Если указать расширение явно, например `golang.png`, `person.webp`, `icons/project.jpg`, resolver ищет именно этот файл.

### Цвет SVG-иконок

Для SVG есть режимы цвета:

- оригинальный цвет;
- цвет текста правила;
- кастомный цвет.

Перекраска SVG сделана через одноцветную mask-модель. Это хорошо работает для простых одноцветных SVG, но не сохраняет многоцветную структуру. Для PNG/WebP/JPG/JPEG цвет иконки не меняется.

## Цвета и фон

Плашки переиспользуют форму тегов Obsidian, но цвета задаются правилами плагина:

- `textColor` - текст;
- `backgroundColor` - фон;
- `fillBackground` - включить или выключить заливку;
- `tagBackgroundOpacity` - общая прозрачность фона всех плашек.

Цвета поддерживают HEX-ввод:

- `#ABC`;
- `#AABBCC`.

В коде за нормализацию отвечают `normalizeHexColorInput`, `hexToRgbChannels`, `applyStyleBackgroundVariables`, `addHexColorSetting`.

## Сокращение путей

Плагин умеет сокращать отображение:

- внутренних ссылок: `[[Project/Exocortex]]` -> `Exocortex`;
- вложенных тегов: `#todo/СрочноВажно` -> `СрочноВажно`.

Это работает в режиме просмотра и не меняет исходный markdown.

Для тегов важно: клик/поиск должен работать по исходному полному тегу. Поэтому оригинальное значение хранится в DOM-атрибутах, а меняется только отображаемый текст.

## Рендереры

### `FileExplorerRenderer`

Отвечает за дерево файлов:

- находит DOM-элементы файлов и папок;
- определяет путь;
- подбирает правило через `StyleIndex`;
- добавляет иконку и классы плашки;
- следит за изменениями дерева через `MutationObserver`.

### `TabHeaderRenderer`

Отвечает за заголовки вкладок:

- получает активный файл вкладки;
- применяет стиль файла или папочного каскада;
- обновляет вкладки через `MutationObserver`.

### `MarkdownLinkRenderer`

Отвечает за Reading View:

- внутренние ссылки;
- внешние ссылки;
- теги;
- сокращение путей;
- теговый вид ссылок.

### `GenericInternalLinkRenderer`

Отвечает за generic DOM-места Obsidian:

- backlinks;
- outgoing links;
- mentions;
- Bases;
- похожие панели, где Obsidian рендерит ссылки и значения не как обычный markdown.

Это наиболее DOM-зависимая часть. Если Obsidian меняет верстку Bases или Properties, чаще всего правка нужна здесь и в helper-функциях вокруг property-value matching.

### Рендер свойств

Свойства и Bases обрабатываются отдельно от обычных markdown-ссылок, потому что там другая DOM-структура:

- вычисляется имя свойства;
- вычисляется значение;
- ищется `propertyValueRule`;
- style wrapper должен не захватывать крестик удаления значения.

Для багов вида "в свойствах работает, а в БД нет" сначала смотреть селекторы и traversal в property-value helper-функциях.

## Вспомогательные классы

### `IconResolver`

Ищет и готовит иконки:

- resolve по имени/пути;
- поиск в `iconSearchPaths`;
- проверка расширений;
- подготовка file/icon signature.

### `StyleIndex`

Строит быстрый индекс правил:

- file rules;
- folder rules;
- external link rules;
- property value rules.

Здесь смотреть при изменении приоритетов, каскада, longest-prefix matching или property matching.

### Suggest-классы

Используются в настройках:

- `VaultPathSuggest` - подсказки путей файлов/папок;
- `IconNameSuggest` - подсказки иконок;
- `TextValueSuggest` - подсказки свойств и значений.

Если клик по подсказке не выбирает значение, проблема обычно в обработчиках pointer/mousedown/click, focus loss или закрытии popup раньше выбора.

### Модалки

- `RuleEditModal` - правило каталога/файла.
- `ExternalLinkRuleEditModal` - правило внешней ссылки.
- `PropertyValueRuleEditModal` - правило значения свойства.
- `MatchedPathsModal` - preview совпавших путей.
- `ValidationReportModal` - отчет валидации правил/иконок.

## Настройки UI

Главный класс настроек: `VaultBadgeStylesSettingTab`.

В настройках есть:

- секции правил каталогов;
- секции правил файлов;
- секции внешних ссылок;
- секции правил значений свойств;
- поиск по правилам;
- кнопки перемещения вверх/вниз;
- кнопка копирования правила;
- кнопка редактирования;
- кнопка удаления;
- preview итогового вида правила;
- глобальные переключатели рендера;
- глобальные размеры и прозрачность;
- экспорт/импорт конфига.

Кнопка копирования создает независимую копию правила рядом с оригиналом.

## Команды

Плагин регистрирует команды:

- `Rebuild icon/style index` - пересобрать индексы иконок/стилей.
- `Refresh file explorer icons` - перерисовать дерево файлов.
- `Refresh reading view links` - перерисовать ссылки в режиме просмотра.
- `Preview matched paths` - показать, какие пути матчятся правилами.
- `Debug current file style` - диагностировать стиль текущего файла.
- `Validate rules and icons` - проверить правила и иконки.
- `Export config` - выгрузить конфиг в `vault-badge-styles.config.json`.
- `Import config` - загрузить конфиг из `vault-badge-styles.config.json`.

## События Obsidian

Плагин слушает:

- изменения metadata cache;
- изменения vault;
- rename/move файлов и папок;
- layout changes;
- открытие/перестройку markdown view.

При `rename` и включенном `autoUpdateRulePathsOnRename` обновляются пути в `folderRules` и `fileRules`.

Внешние ссылки и property rules при rename не меняются: у них нет связи с путем vault.

## Экспорт и импорт

Конфиг экспортируется в `vault-badge-styles.config.json`.

Это полезно для переноса между vault, но нужно помнить:

- правила категорий personal не стоит копировать в Avito один-в-один;
- общие настройки рендера можно переносить;
- пути иконок должны существовать в целевом vault.

## Что важно не сломать

- Не возвращать frontmatter-настройки: текущая архитектура специально ушла от этого.
- Не хардкодить категории в CSS/snippets.
- Не делать отдельные CSS snippets для категорий: категории должны жить в правилах плагина.
- Не менять markdown ради визуального сокращения ссылок/тегов.
- Не применять стиль к крестикам удаления значений свойств.
- Не считать `done` глобальным значением: стиль свойства зависит от пары `property + value`.
- Не завязываться только на `.md`: файловые правила должны работать с любым форматом.

## Типичные места для правок

### Добавить новое поле правила

Проверить и обновить:

- `DEFAULT_SETTINGS`, если поле глобальное;
- `cleanRule`, `cleanExternalLinkRule`, `cleanPropertyValueRule`;
- `clonePlainRule`;
- `buildStyleFromRule` или место сборки style object;
- модалки редактирования правил;
- preview правила;
- export/import compatibility;
- `README.md`;
- `PLUGIN_CONTEXT.md`.

### Добавить новый тип поверхности Obsidian

Сначала понять, это:

- markdown reading view;
- file explorer;
- tab header;
- property/Bases/generic panel;
- Live Preview.

Потом:

- расширить существующий renderer, если DOM похож;
- или добавить новый renderer-класс;
- зарегистрировать его в `onload`;
- добавить refresh/unload;
- добавить настройку enable-флага, если поверхность опциональная.

### Починить Bases/Properties

Сначала смотреть:

- helper-функции нормализации property name/value;
- селекторы property value content;
- `GenericInternalLinkRenderer`;
- функции wrapper/unwrapper для property values;
- чтобы style wrapper не захватывал control nodes и крестик удаления.

### Починить выбор подсказок в настройках

Сначала смотреть:

- `VaultPathSuggest`;
- `IconNameSuggest`;
- `TextValueSuggest`;
- обработчики `mousedown`, `pointerdown`, `click`, `keydown`;
- момент закрытия suggest popup.

### Изменить поведение иконок

Сначала смотреть:

- `ICON_FILE_EXTENSIONS`;
- `hasIconFileExtension`;
- `getIconFileExtension`;
- `IconResolver`;
- `createIconElement`;
- `isSvgIconStyle`;
- `getEffectiveIconColor`.

## Ограничения

- Полный Live Preview через CodeMirror пока не реализован.
- Плагин DOM-зависимый: новые версии Obsidian могут менять структуру Properties/Bases.
- SVG recolor работает как одноцветная mask-модель.
- Плагин не должен заниматься синхронизацией vault и не должен конфликтовать с WebDAV.
- Автообновление путей работает только на rename/move внутри Obsidian. Если переименовать файлы вне Obsidian, правила могут не обновиться.

## Проверки перед релизом

Минимальный набор:

```bash
node --check main.js
node -e "JSON.parse(require('fs').readFileSync('manifest.json','utf8')); JSON.parse(require('fs').readFileSync('versions.json','utf8'))"
git diff --check
```

Ручная проверка в Obsidian:

- дерево файлов;
- Reading View;
- заголовки вкладок;
- свойства;
- Bases;
- внешние ссылки;
- сокращение путей и тегов;
- выбор подсказок в настройках;
- импорт/экспорт конфига.

## Релиз через BRAT/GitHub

Обычный flow:

1. Поднять версию в `manifest.json`.
2. Добавить эту версию в `versions.json`.
3. Проверить `main.js`, JSON и `git diff --check`.
4. Закоммитить.
5. Запушить `main`.
6. Создать GitHub release с файлами:
   - `main.js`;
   - `manifest.json`;
   - `styles.css`.

Пример:

```bash
gh release create 0.1.13 main.js manifest.json styles.css --title "0.1.13" --notes "Описание изменений"
```

BRAT видит новую версию только после GitHub release/tag, одного push в `main` недостаточно.
