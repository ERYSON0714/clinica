#!/usr/bin/env node
const pool = require('../db');

async function run() {
  try {
    // find or create gestor (clinica_gestor)
    const [grows] = await pool.query('SELECT id FROM clinica_gestor LIMIT 1');
    let gestorId;
    if (grows.length > 0) {
      gestorId = grows[0].id;
      console.log('using existing gestor id', gestorId);
    } else {
      const [r] = await pool.query("INSERT INTO clinica_gestor (nome, email) VALUES (?, ?)", ['Admin Seed', `seed+${Date.now()}@example.com`]);
      gestorId = r.insertId;
      console.log('created gestor id', gestorId);
    }

    // insert setor
    const [sRows] = await pool.query('SELECT id FROM setor LIMIT 1');
    let setorId;
    if (sRows.length > 0) {
      setorId = sRows[0].id;
      console.log('using existing setor id', setorId);
    } else {
      const [r] = await pool.query("INSERT INTO setor (nome, codigo) VALUES (?, ?)", ['Geral', 'S1']);
      setorId = r.insertId;
      console.log('created setor id', setorId);
    }

    // insert bairro
    const [bRows] = await pool.query('SELECT id FROM bairro LIMIT 1');
    let bairroId;
    if (bRows.length > 0) {
      bairroId = bRows[0].id;
      console.log('using existing bairro id', bairroId);
    } else {
      const [r] = await pool.query('INSERT INTO bairro (nome, setor_id) VALUES (?, ?)', ['Central', setorId]);
      bairroId = r.insertId;
      console.log('created bairro id', bairroId);
    }

    // insert medico
    const [mRows] = await pool.query("SELECT id FROM medico LIMIT 1");
    let medicoId;
    if (mRows.length > 0) {
      medicoId = mRows[0].id;
      console.log('using existing medico id', medicoId);
    } else {
      // registro_profissional must be numeric according to DB CHECK constraint
      const [r] = await pool.query("INSERT INTO medico (nome, especialidade, registro_profissional) VALUES (?, ?, ?)", ['Dr. Teste', 'Médico', '1001']);
      medicoId = r.insertId;
      console.log('created medico id', medicoId);
    }

    // insert vaga
    const [vRows] = await pool.query('SELECT id FROM vaga LIMIT 1');
    let vagaId;
    if (vRows.length > 0) {
      vagaId = vRows[0].id;
      console.log('using existing vaga id', vagaId);
    } else {
      const hoje = new Date();
      const data = hoje.toISOString().slice(0,10);
      const [r] = await pool.query('INSERT INTO vaga (medico_id, data, dia_semana, hora_inicio, duracao_min, status, criado_por) VALUES (?, ?, ?, ?, ?, ?, ?)', [medicoId, data, 'seg', '09:00:00', 30, 'pendente', gestorId]);
      vagaId = r.insertId;
      console.log('created vaga id', vagaId);
    }

    // pick a paciente id to reference
    const [pRows] = await pool.query('SELECT id FROM paciente LIMIT 1');
    const pacienteId = pRows.length > 0 ? pRows[0].id : null;

    // insert historico_auditoria record using detected schema (acao, gestor_id, paciente_id)
    if (pacienteId) {
      const [h] = await pool.query("INSERT INTO historico_auditoria (acao, gestor_id, paciente_id) VALUES (?, ?, ?)", ['criado', gestorId, pacienteId]);
      console.log('historico_auditoria inserted id', h.insertId);
    } else {
      console.log('no paciente found to reference in historico_auditoria');
    }

    // final counts
    const tables = ['paciente','medico','agendamento','vaga','setor','bairro','clinica_gestor','historico_auditoria'];
    console.log('-- counts after seed_refs2 --');
    for (const t of tables) {
      try {
        const [r] = await pool.query(`SELECT COUNT(*) AS c FROM \`${t}\``);
        console.log(`${t}:`, r[0].c);
      } catch (e) {
        console.log(`${t}: ERR -`, e.message);
      }
    }

    process.exit(0);
  } catch (e) {
    console.error('seed_refs2 fatal:', e.message);
    process.exit(1);
  }
}

run();
