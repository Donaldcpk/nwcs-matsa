/*:
 * @target MZ
 * @plugindesc 無限之塔 Map65：地圖名稱顯示為「無限之塔 第N層」（預設變數202）
 * @author tower-setup
 *
 * @param mapId
 * @text 塔地圖 ID
 * @type number
 * @default 65
 *
 * @param floorVariableId
 * @text 樓層變數 ID
 * @type variable
 * @default 202
 */

(() => {
  'use strict';
  const params = PluginManager.parameters('TowerFloorDisplayName');
  const TOWER_MAP_ID = Number(params.mapId || 65);
  const FLOOR_VAR = Number(params.floorVariableId || 202);
  const DISPLAY_MAX_FLOOR = 100;

  const _Game_Map_displayName = Game_Map.prototype.displayName;
  Game_Map.prototype.displayName = function () {
    if (this.mapId() === TOWER_MAP_ID) {
      let f = Number($gameVariables.value(FLOOR_VAR)) || 0;
      if (f < 1) f = 1;
      if (f > DISPLAY_MAX_FLOOR) f = DISPLAY_MAX_FLOOR;
      return '無限之塔 第' + f + '層';
    }
    return _Game_Map_displayName.call(this);
  };

  // 進入塔地圖時同步變數，避免對話 \\V[202] 仍顯示 0
  const _Scene_Map_start = Scene_Map.prototype.start;
  Scene_Map.prototype.start = function () {
    _Scene_Map_start.call(this);
    if ($gameMap.mapId() === TOWER_MAP_ID) {
      const v = Number($gameVariables.value(FLOOR_VAR)) || 0;
      if (v < 1) {
        $gameVariables.setValue(FLOOR_VAR, 1);
      }
    }
  };
})();
