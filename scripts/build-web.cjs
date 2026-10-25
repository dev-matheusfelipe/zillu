// Gera bundle self-hosted. Nenhum script remoto nem token secreto no navegador.
const esbuild=require('esbuild');
esbuild.buildSync({entryPoints:['sfu/client-entry.js'],bundle:true,minify:true,format:'iife',target:['chrome120'],outfile:'public/livekit.bundle.js'});
console.log('LiveKit client bundle criado: public/livekit.bundle.js');
