import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
const require=createRequire(import.meta.url)
const parseObjects=require('phaser/src/tilemaps/parsers/tiled/ParseObjectLayers')
const parseImages=require('phaser/src/tilemaps/parsers/tiled/ParseImageLayers')
const map=JSON.parse(fs.readFileSync(new URL('../public/art-v2/home-room.tmj',import.meta.url),'utf8'))
const atlas=JSON.parse(fs.readFileSync(new URL('../public/art-v2/home-atlas.json',import.meta.url),'utf8'))
test('Phaser accepts the Tiled room layers and every image has native day/night atlas frames',()=>{
  const objects=parseObjects(structuredClone(map)),images=parseImages(structuredClone(map))
  assert.deepEqual(objects.map(layer=>layer.name),['walkable','walls','furniture','interaction-bounds','anchors'])
  assert.equal(objects.find(layer=>layer.name==='anchors').objects.length,9)
  assert.equal(images.length,14)
  for(const layer of images){
    const frame=layer.properties.find(p=>p.name==='atlasFrame').value
    assert.ok(atlas.frames[`${frame}-day`]&&atlas.frames[`${frame}-night`])
    assert.ok(fs.existsSync(new URL('../public/art-v2/'+layer.image,import.meta.url)))
  }
})
