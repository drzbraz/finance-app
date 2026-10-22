import { describeMovement, isHolder } from './describe.js';

describe('describeMovement', () => {
  it.each([
    ['COMPRA 1254 CONTINENTE 4435-665 BAG CONTACTLESS', 'purchase', 'Continente Bag'],
    ['COMPRA 1254 LLAOLLAO PT PARQUE N RI CONTACTLESS', 'purchase', 'Llaollao Parque N Ri'],
    ['COMPRA 1254 MBWAY - CINEMAS 1600-404 LISBOA', 'purchase', 'Cinemas Lisboa'],
    ['COMPRA 1254 Google Chrome 65 USD TC 0.8620000', 'purchase', 'Google Chrome 65'],
    ['COMPRA 1254 UBR PENDING.UBER.COM AMSTERDAM NL', 'purchase', 'Uber'],
    ['COMPRA 1254 BAR S DOS REIS PORTO PT CONTACTLESS', 'purchase', 'Bar S dos Reis Porto'],
    ['DD Solinca Classi 00057419885 PT40100188', 'direct-debit', 'Solinca Classi'],
    ['DD GracieBarraRio 82849480274 PT67120072', 'direct-debit', 'Gracie Barra'],
    ['COM.CONTA PLANO AB PLUS 082026', 'fee', 'Comissão da conta'],
    ['IMPOSTO SELO ART 17.3.4', 'fee', 'Imposto do selo'],
    ['IMPOSTO DO SELO', 'fee', 'Imposto do selo'],
    ['CUSTO DE SERVICO INTERNACIONAL', 'fee', 'Custo de serviço internacional'],
    ['TRF MB WAY P/ JOAO EXEMPLO', 'transfer-out', 'Transferência para Joao Exemplo (MB WAY)'],
    ['TRF P/ ATTICA CLINIC SERVICOS MEDICOS,LDA', 'transfer-out', 'Transferência para Attica Clinic Servicos Medicos,lda'],
    ['TRF. P/O Ana Maria Teste Silva', 'transfer-in', 'Transferência de Ana Maria Teste Silva'],
    ['LEVANTAMENTO 1254 MULTIBANCO', 'cash', 'Levantamento'],
    ['Mangopay', 'other', 'Mangopay'],
  ])('%s', (raw, kind, description) => {
    expect(describeMovement(raw, 'debit')).toMatchObject({ kind, description });
  });

  it('names generic transfers by direction, without the reference', () => {
    expect(describeMovement('Transferencia TransferWise:T2399772173', 'debit')).toEqual({ kind: 'transfer-out', description: 'Transferência Transferwise' });
    expect(describeMovement('Transferencia TransferWise:T1', 'credit').kind).toBe('transfer-in');
  });

  it('keeps the raw text when cleaning leaves nothing', () => {
    expect(describeMovement('PT', 'debit').description).toBe('PT');
  });
});

describe('isHolder', () => {
  it('needs every name of the holder, in any order, extra names allowed', () => {
    expect(isHolder('Ana Maria Teste Silva', 'ANA TESTE SILVA')).toBe(true);
    expect(isHolder('Ana Silva', 'ANA TESTE SILVA')).toBe(false);
    expect(isHolder('Joao Exemplo', 'ANA TESTE SILVA')).toBe(false);
    expect(isHolder(undefined, 'ANA TESTE SILVA')).toBe(false);
    expect(isHolder('Ana', null)).toBe(false);
    expect(isHolder('Ana', 'ANA')).toBe(false);
  });
});
