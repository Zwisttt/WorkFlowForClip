<template>
  <div class="main-layout">
    <TwoLevelSidebar ref="sidebarRef" />
    <div class="main-layout__body">
      <!-- macOS traffic lights spacer for right panel -->
      <div class="main-layout__titlebar" />
      <Header />
      <!-- Sub-nav bar (horizontal, below header) -->
      <nav v-if="subItems.length > 0" class="main-layout__sub-nav">
        <router-link
          v-for="item in subItems"
          :key="item.id"
          :to="item.path!"
          class="main-layout__sub-nav-item"
          :class="{ 'main-layout__sub-nav-item--active': route.path === item.path }"
        >
          {{ item.label }}
        </router-link>
      </nav>
      <main class="main-layout__content">
        <router-view v-slot="{ Component }">
          <transition name="fade" mode="out-in">
            <component :is="Component" />
          </transition>
        </router-view>
      </main>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import TwoLevelSidebar from '@/renderer/components/TwoLevelSidebar.vue';
import Header from '@/renderer/components/Header.vue';
import type { NavItem } from '@/renderer/components/TwoLevelSidebar.vue';

const route = useRoute();
const sidebarRef = ref<InstanceType<typeof TwoLevelSidebar> | null>(null);

const subItems = computed<NavItem[]>(() => {
  return (sidebarRef.value?.activeSubItems as NavItem[]) ?? [];
});
</script>

<style scoped>
.main-layout {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.main-layout__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 0;
}

/* macOS traffic lights spacer */
.main-layout__titlebar {
  height: 38px;
  flex-shrink: 0;
  -webkit-app-region: drag;
}

.main-layout__sub-nav {
  display: flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0 var(--space-6);
  height: 40px;
  background: var(--color-bg-card);
  border-bottom: 1px solid var(--color-border-light);
  flex-shrink: 0;
}

.main-layout__sub-nav-item {
  padding: var(--space-2) var(--space-3);
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
  text-decoration: none;
  border-radius: var(--radius-sm);
  transition: all var(--transition-fast);
}

.main-layout__sub-nav-item:hover {
  color: var(--color-text-primary);
  background: var(--color-bg-page);
}

.main-layout__sub-nav-item--active {
  color: var(--color-primary);
  font-weight: var(--font-weight-medium);
  background: var(--color-primary-lighter);
}

.main-layout__content {
  flex: 1;
  padding: var(--space-6);
  overflow-y: auto;
  background: var(--color-bg-page);
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity var(--transition-fast);
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
