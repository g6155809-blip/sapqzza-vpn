# SAPQZZA VPN

Мобильное VPN-приложение на Expo/React Native. Пользователь вводит ключ доступа, выбирает сервер и подключается к VPN.

## Run & Operate

- `pnpm --filter @workspace/sapqzza-vpn run dev` — запуск Expo dev-сервера
- `pnpm run typecheck` — полная проверка типов
- `pnpm run build` — сборка всех пакетов
- `pnpm --filter @workspace/api-spec run codegen` — перегенерация API хуков

## Stack

- pnpm workspaces, Node.js 20, TypeScript 5.9
- Mobile: Expo 54 + React Native 0.81.5 + Expo Router 6
- State: AsyncStorage (локальное хранилище без бэкенда)
- Build/CI: GitHub Actions + EAS (Expo Application Services)

## Where things live

- `artifacts/sapqzza-vpn/` — основное Expo приложение
- `artifacts/sapqzza-vpn/context/AppContext.tsx` — весь стейт приложения (ключи, серверы, статус VPN)
- `artifacts/sapqzza-vpn/components/KeyEntryScreen.tsx` — экран ввода ключа
- `artifacts/sapqzza-vpn/components/MainVpnScreen.tsx` — главный экран VPN
- `artifacts/sapqzza-vpn/app.json` — конфигурация Expo (bundle ID, название, иконки)
- `artifacts/sapqzza-vpn/eas.json` — профили EAS сборки (preview=APK, production=AAB)
- `.github/workflows/build-apk.yml` — CI/CD для сборки APK

## Architecture decisions

- Ключи доступа хранятся локально в `AppContext.tsx` в `VALID_KEYS` — для добавления нового ключа нужно обновить этот файл
- Привязка ключа к устройству через `deviceId` в AsyncStorage — один ключ = одно устройство
- Статистика VPN (download/upload/time) симулируется таймером — реальный VPN туннель не реализован
- Для APK сборки используется EAS local build (без облака EAS) — требует `EXPO_TOKEN` в GitHub Secrets

## Product

- Экран ввода ключа: пользователь вводит ключ вида `SAPQZZA-2026-PREM`
- Главный экран: кнопка подключения, выбор сервера (8 стран), статистика, профиль
- Поддержка: ссылка на Telegram @sapqzzavpn

## User preferences

- Язык интерфейса приложения: русский
- Тёмная тема (userInterfaceStyle: "dark")

## Gotchas

- Lockfile сгенерирован pnpm 10.x — workflow должен использовать version: '10'
- При добавлении нового ключа нужно обновить `VALID_KEYS` в `AppContext.tsx`
- EAS local build требует Android SDK на CI — используется `android-actions/setup-android@v3`

## Поinters

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
