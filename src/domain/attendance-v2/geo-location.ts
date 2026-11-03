export interface GeoLocationProps {
  latitude: number;
  longitude: number;
  accuracyMeters?: number;
}

export interface GeoLocationDTO {
  latitude: number;
  longitude: number;
  accuracyMeters: number;
}

export class GeoLocation {
  readonly latitude: number;
  readonly longitude: number;
  readonly accuracyMeters: number;

  constructor(props: GeoLocationProps) {
    if (!props || typeof props !== 'object') {
      throw new Error('Thông số GeoLocation không được để trống');
    }

    const { latitude, longitude, accuracyMeters = 0 } = props;

    if (typeof latitude !== 'number' || !Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new Error('Vĩ độ (latitude) phải là số từ -90 đến 90');
    }

    if (typeof longitude !== 'number' || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new Error('Kinh độ (longitude) phải là số từ -180 đến 180');
    }

    if (typeof accuracyMeters !== 'number' || !Number.isFinite(accuracyMeters) || accuracyMeters < 0) {
      throw new Error('Độ chính xác (accuracyMeters) phải là số không âm');
    }

    this.latitude = latitude;
    this.longitude = longitude;
    this.accuracyMeters = accuracyMeters;
  }

  /**
   * Tính khoảng cách mét giữa 2 toạ độ theo công thức Haversine (bán kính Trái Đất 6.371.000m)
   */
  calculateDistanceMeters(other: GeoLocation): number {
    if (!other || !(other instanceof GeoLocation)) {
      throw new Error('Toạ độ đích không hợp lệ');
    }

    const R = 6371000; // Bán kính Trái Đất tính bằng mét
    const rad = Math.PI / 180;
    const dLat = (other.latitude - this.latitude) * rad;
    const dLon = (other.longitude - this.longitude) * rad;
    const lat1 = this.latitude * rad;
    const lat2 = other.latitude * rad;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  /**
   * Kiểm tra toạ độ hiện tại có nằm trong bán kính cho phép của văn phòng hay không
   */
  isWithinRadius(office: GeoLocation, allowedRadiusMeters: number): boolean {
    if (typeof allowedRadiusMeters !== 'number' || !Number.isFinite(allowedRadiusMeters) || allowedRadiusMeters < 0) {
      throw new Error('Bán kính cho phép phải là số không âm');
    }
    return this.calculateDistanceMeters(office) <= allowedRadiusMeters;
  }

  equals(other: GeoLocation): boolean {
    if (!other || !(other instanceof GeoLocation)) return false;
    return (
      this.latitude === other.latitude &&
      this.longitude === other.longitude &&
      this.accuracyMeters === other.accuracyMeters
    );
  }

  toJSON(): GeoLocationDTO {
    return {
      latitude: this.latitude,
      longitude: this.longitude,
      accuracyMeters: this.accuracyMeters
    };
  }
}
