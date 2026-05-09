<script setup lang="ts">
import { computed } from 'vue'
import RamPet from './components/RamPet.vue'

const isDesktop = computed(() => new URLSearchParams(window.location.search).get('desktop') === '1')
</script>

<template>
  <main v-if="isDesktop" class="desktop-shell" aria-label="Ram desktop pet">
    <RamPet desktop />
  </main>

  <main v-else class="app-shell">
    <section class="stage" aria-label="Ram desktop pet preview">
      <RamPet />
    </section>

    <aside class="asset-panel" aria-label="Asset checklist">
      <h1>中级阶段拉姆宠物</h1>
      <p>
        完整桌面状态素材已经接入 <code>src/assets/ram/</code>。点击、双击、拖拽、右键菜单会切换对应状态（需求数值与底层需求立绘暂未启用）。
      </p>
      <dl>
        <div>
          <dt>idle</dt>
          <dd>默认站立，轻微呼吸</dd>
        </div>
        <div>
          <dt>happy</dt>
          <dd>点击后开心弹跳</dd>
        </div>
        <div>
          <dt>walk</dt>
          <dd>两帧摆动，自动横向移动</dd>
        </div>
        <div>
          <dt>sleep</dt>
          <dd>闲置后闭眼睡觉</dd>
        </div>
        <div>
          <dt>care</dt>
          <dd>陪伴类素材已就位；数值驱动的需求状态尚未接入</dd>
        </div>
      </dl>
    </aside>
  </main>
</template>
