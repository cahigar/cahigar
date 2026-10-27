# Cómo funciona la portada

Todo lo que ves en github.com/cahigar se genera desde este repo.

| Pieza | Fichero | Quién la actualiza |
|---|---|---|
| Cabecera animada | `assets/header.svg` | a mano (SVG con animaciones CSS/SMIL) |
| Tarjetas de proyectos | `assets/generated/cards/*.svg` | Action *Actualizar portada* |
| Panel de actividad (contribuciones, rachas, lenguajes) | `assets/generated/panel.svg` | Action *Actualizar portada* (cada 6 h) |
| «Últimos movimientos» | bloque `RECIENTE` del README | Action *Actualizar portada* |
| Serpiente | rama `output` | Action *Generar serpiente* (cada 12 h) |

## Añadir un proyecto a la portada

Dos formas:

1. **Rápida**: en el repo (público), *About → ⚙️ → Topics*, añade `portfolio`. En la siguiente ejecución sale su tarjeta con la descripción, la web y sus lenguajes.
2. **Cuidada**: añade una entrada en `profile/projects.json` (título, subtítulo, descripción, tecnologías, color de acento, web). Al hacer push se regenera sola.

Para forzarlo ya: *Actions → Actualizar portada → Run workflow*.

## Probar en local

```bash
GITHUB_TOKEN=<token de solo lectura> node scripts/build-profile.mjs
```

Sin token regenera solo las tarjetas. No necesita `npm install`: es Node 22 sin dependencias.

## Contribuciones privadas (opcional)

Con el `GITHUB_TOKEN` de Actions el panel cuenta la actividad pública. Si quieres que cuente también la privada, crea un token *fine-grained* de solo lectura y guárdalo como secreto `PROFILE_TOKEN` en *Settings → Secrets and variables → Actions*; el workflow lo usa automáticamente si existe. (Y activa *Settings → Public profile → Include private contributions on my profile*.)
