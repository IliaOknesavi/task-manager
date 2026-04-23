# Деплой TaskManager на Railway

## Что получишь

- Приложение живёт по адресу вида `https://taskmanager-production.up.railway.app`
- Данные (`data/` и `tasks/`) хранятся на persistent volume — не теряются при редеплое
- Android-приложение и любые другие клиенты подключаются к этому же URL через `/api/agent`

---

## Шаг 1 — Залить код на GitHub

```bash
cd /path/to/TaskManager

git init
git add .
git commit -m "Initial commit"

# Создай репозиторий на github.com, затем:
git remote add origin https://github.com/ВАШ_USERNAME/taskmanager.git
git push -u origin main
```

---

## Шаг 2 — Создать проект на Railway

1. Открой [railway.app](https://railway.app) → войди через GitHub
2. **New Project → Deploy from GitHub repo** → выбери `taskmanager`
3. Railway автоматически обнаружит `Dockerfile` и `railway.toml`
4. Нажми **Deploy** — первый билд займёт ~2 минуты

---

## Шаг 3 — Добавить persistent volume (важно!)

Без этого данные сбрасываются при каждом редеплое.

1. В проекте на Railway → вкладка **Volumes**
2. **Add Volume** → Mount path: `/app/data` → Save
3. **Add Volume** ещё раз → Mount path: `/app/tasks` → Save
4. Railway автоматически передеплоит сервис

---

## Шаг 4 — Открыть приложение

1. Вкладка **Settings → Networking → Generate Domain**
2. Railway даст URL вида `https://taskmanager-xxx.up.railway.app`
3. Открой его в браузере — всё работает

---

## Шаг 5 — Защита паролем (рекомендуется)

Так как API открытое, стоит добавить базовую защиту через env-переменную.

В Railway → **Variables** добавь:
```
API_SECRET=придумай-длинный-ключ-здесь
```

Потом мы добавим проверку этого ключа в `/api/agent` для Android-приложения.

---

## Подключение Android-приложения

Базовый URL для всех запросов:
```
https://taskmanager-xxx.up.railway.app/api/agent
```

Пример запроса (список проектов):
```json
POST /api/agent
Content-Type: application/json

{ "op": "list" }
```

Подробная документация по API — в `src/app/api/agent/AGENT.md`.

---

## Стоимость

Railway даёт **$5 credit/месяц** бесплатно, которых хватает на небольшое приложение.
Если трафик вырастет — платный план от $5/месяц.

Альтернативы: **Render** (бесплатный tier, но засыпает через 15 мин без активности) и **Fly.io**.
