/**
 * FILE: server/lib/seedAdminUser.js
 * PURPOSE: Bootstrap the first AdminUser row from the ADMIN_GITHUB_USERNAME env var.
 *          This runs once at server startup and is a no-op if any AdminUser already exists.
 *
 * BOOTSTRAP-ONLY: ADMIN_GITHUB_USERNAME is used ONLY for this initial seed.
 * Once at least one AdminUser row exists, this function does nothing and the env var
 * is ignored. Admin management (adding/removing/changing roles) must happen via the
 * AdminUser DB table directly (e.g. via Prisma Studio or a future admin management API).
 *
 * See .env.example for documentation of the ADMIN_GITHUB_USERNAME variable.
 *
 * DEPENDENCIES: server/lib/prisma
 * USED BY: server/index.js
 */

import prisma from './prisma.js'

/**
 * Seeds the first SUPER_ADMIN row if the AdminUser table is empty and
 * the ADMIN_GITHUB_USERNAME environment variable is set.
 *
 * @returns {Promise<void>}
 */
export async function seedAdminUser() {
  // Ensure 'dev_trainee' exists so local developers are never locked out of Admin & Government views
  try {
    const devAdmin = await prisma.adminUser.findUnique({
      where: { githubUsername: 'dev_trainee' },
    })
    if (!devAdmin) {
      await prisma.adminUser.create({
        data: {
          githubUsername: 'dev_trainee',
          role: 'SUPER_ADMIN',
        },
      })
      console.log('[seedAdminUser] ✅ Seeded default dev_trainee as SUPER_ADMIN for local development.')
    }
  } catch (err) {
    // Non-fatal
  }

  const username = process.env.ADMIN_GITHUB_USERNAME?.trim()

  if (!username) {
    // No env var set — nothing else to seed.
    return
  }

  try {
    const existingCount = await prisma.adminUser.count()

    if (existingCount > 0) {
      console.log(
        `[seedAdminUser] AdminUser table already has ${existingCount} row(s) — skipping bootstrap seed. ` +
          `ADMIN_GITHUB_USERNAME env var is now ignored; manage admins via the AdminUser table.`
      )
      return
    }

    // Table is empty — create the bootstrap SUPER_ADMIN
    const admin = await prisma.adminUser.create({
      data: {
        githubUsername: username,
        role: 'SUPER_ADMIN',
      },
    })

    console.log(
      `[seedAdminUser] ✅ Bootstrap SUPER_ADMIN created: githubUsername="${admin.githubUsername}" id="${admin.id}". ` +
        `ADMIN_GITHUB_USERNAME env var is now bootstrap-only — further admin management uses the AdminUser table.`
    )
  } catch (err) {
    console.error('[seedAdminUser] Failed to seed bootstrap admin:', err)
    // Non-fatal — server continues. The admin can be created manually later.
  }
}
