// test/e2e/perfis-modelo.test.ts — empresas criadas ANTES do modelo de perfis: o job preenche só
// perfil vazio ou inexistente, uma vez por empresa, e não mexe no que o dono configurou.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { E2E, run } from './_harness';

if (!E2E) {
  test('e2e pulado', { skip: true }, () => {});
} else {
  after(async () => { const { prisma } = await import('../../src/infra/prisma'); await prisma.$disconnect(); });

  test('empresa antiga: perfis vazios ganham o modelo, perfil configurado fica, e só uma vez', async () => {
    const { prisma } = await import('../../src/infra/prisma');
    const { onboardTenant } = await import('../../src/core/platform/onboarding.service');
    const { aplicarModeloNasEmpresasAntigas, MARCA_MODELO } = await import('../../src/core/rbac/role-templates');
    const slug = `antiga-${run.toLowerCase()}`;
    const { tenant } = await onboardTenant({ slug, name: 'Antiga Ltda', adminEmail: `admin@${slug}.local`, adminPassword: 'Senha-12345678', modules: ['VAREJO', 'FOOD'] });
    const tenantId = tenant.id;
    const chaves = async (key: string) => (await prisma.rolePermission.findMany({ where: { tenantId, role: { key } }, select: { permissionKey: true } })).map((p) => p.permissionKey).sort();
    const settings = async () => (await prisma.tenant.findUniqueOrThrow({ where: { id: tenantId } })).settings as Record<string, unknown>;
    assert.equal((await settings())[MARCA_MODELO], 1, 'empresa nova já nasce marcada');

    // Como era antes do modelo: Gerente e Caixa vazios, sem Garçom, Operador configurado pelo dono, sem marca.
    await prisma.rolePermission.deleteMany({ where: { tenantId, role: { key: { in: ['gerente', 'caixa', 'operador'] } } } });
    await prisma.role.deleteMany({ where: { tenantId, key: 'garcom' } });
    const operador = await prisma.role.findUniqueOrThrow({ where: { tenantId_key: { tenantId, key: 'operador' } } });
    await prisma.rolePermission.create({ data: { tenantId, roleId: operador.id, permissionKey: 'core.customers:view' } });
    const { [MARCA_MODELO]: _m, ...semMarca } = await settings(); void _m;
    await prisma.tenant.update({ where: { id: tenantId }, data: { settings: semMarca as never } });

    const r = await aplicarModeloNasEmpresasAntigas();
    assert.ok(r.empresas >= 1 && r.perfisPreenchidos >= 3);
    const caixa = await chaves('caixa');
    assert.ok(caixa.includes('varejo.pdv:operate') && caixa.includes('food.salao:close'), 'Caixa soma Varejo e Food');
    assert.ok((await chaves('gerente')).includes('food.cardapio:manage'));
    assert.ok((await chaves('garcom')).includes('food.salao:operate'), 'perfil que faltava nasce');
    assert.deepEqual(await chaves('operador'), ['core.customers:view'], 'perfil configurado pelo dono não muda');
    assert.equal((await settings())[MARCA_MODELO], 1);

    // Depois de aplicado, o dono tira uma chave do Gerente: o job não devolve.
    await prisma.rolePermission.deleteMany({ where: { tenantId, permissionKey: 'food.cardapio:manage', role: { key: 'gerente' } } });
    await aplicarModeloNasEmpresasAntigas();
    assert.ok(!(await chaves('gerente')).includes('food.cardapio:manage'), 'uma vez por empresa');
  });
}
