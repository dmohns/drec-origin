import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  MeasurementDTO,
  ReadDTO,
  FilterDTO,
  ReadsService as BaseReadService,
  Unit,
} from '@energyweb/energy-api-influxdb';
import { DeviceService } from '../device/device.service';
import { OrganizationService } from '../organization/organization.service';
import { DateTime } from 'luxon';
import { Device } from '../device/device.entity';
import { BASE_READ_SERVICE } from './const';
import { EventBus } from '@nestjs/cqrs';
import { GenerationReadingStoredEvent } from '../../events/GenerationReadingStored.event';
import { BigNumber } from 'ethers';
import { DeviceDTO } from '../device/dto';

@Injectable()
export class ReadsService {
  private readonly logger = new Logger(ReadsService.name);

  constructor(
    @Inject(BASE_READ_SERVICE)
    private baseReadsService: BaseReadService,
    private readonly deviceService: DeviceService,
    private readonly organizationService: OrganizationService,
    private readonly eventBus: EventBus,
  ) {}

  public async storeRead(
    id: string,
    measurements: MeasurementDTO,
  ): Promise<void> {
    this.logger.debug('DREC is storing smart meter reads:');
    this.logger.debug(JSON.stringify(measurements));

    const device = await this.deviceService.findOne(+id);

    if (!device) {
      throw new NotFoundException(`No device found with id ${id}`);
    }

    const roundedMeasurements = this.roundMeasurementsToUnit(measurements);

    const filteredMeasurements = await this.filterMeasurements(
      id,
      measurements,
      device,
    );

    await this.storeGenerationReading(id, filteredMeasurements, device);
  }

  private async storeGenerationReading(
    id: string,
    measurements: MeasurementDTO,
    device: Device,
  ): Promise<void> {
    const organization = await this.organizationService.findOne(
      device.registrant_organisation_code,
    );

    if (!organization) {
      throw new NotFoundException(
        `No organization found with device organization code ${device.registrant_organisation_code}`,
      );
    }

    await this.store(id, measurements);

    for (const measurement of measurements.reads) {
      const startTime = DateTime.fromJSDate(measurement.timestamp)
        .minus({ minutes: 30 })
        .toJSDate();
      const endTime = DateTime.fromJSDate(measurement.timestamp).toJSDate();

      this.eventBus.publish(
        new GenerationReadingStoredEvent({
          deviceId: +id,
          energyValue: BigNumber.from(measurement.value),
          fromTime: startTime,
          toTime: endTime,
          organizationId: organization.code,
        }),
      );
    }
  }

  private async store(id: string, measurements: MeasurementDTO): Promise<void> {
    return await this.baseReadsService.store(id, measurements);
  }

  private roundMeasurementsToUnit(measurement: MeasurementDTO): MeasurementDTO {
    const getMultiplier = (unit: Unit) => {
      switch (unit) {
        case Unit.Wh:
          return 1;
        case Unit.kWh:
          return 10 ** 3;
        case Unit.MWh:
          return 10 ** 6;
        case Unit.GWh:
          return 10 ** 9;
      }
    };

    const multiplier = getMultiplier(measurement.unit);

    return {
      reads: measurement.reads.map((r) => ({
        timestamp: r.timestamp,
        value: Math.round(r.value * multiplier),
      })),
      unit: Unit.Wh,
    };
  }

  private async filterMeasurements(
    id: string,
    measurement: MeasurementDTO,
    device: DeviceDTO,
  ): Promise<MeasurementDTO> {
    const final = await this.getLatestRead(id);
    if (!final || !device) {
      return measurement;
    }
    return {
      reads: measurement.reads.filter((read: ReadDTO) =>
        this.validateEnergy(read, final, device),
      ),
      unit: measurement.unit,
    };
  }

  // This will be changed - just for testing
  private async getLatestRead(meterId: string): Promise<ReadDTO> {
    return await this.baseReadsService.findLatestRead(meterId);
  }

  private validateEnergy(
    read: ReadDTO,
    final: ReadDTO,
    device: DeviceDTO,
  ): boolean {
    const computeMaxEnergy = (
      capacity: number,
      meteredTimePeriod: number,
      deviceAge: number,
      degradation: number,
      yieldValue: number,
    ) => {
      // Max calculated energy formula = Device capacity [kW] * metered time period [h] * device age [years] * degradation [%/year] * yield [kWh/kW]
      return (
        capacity * meteredTimePeriod * deviceAge * degradation * yieldValue
      );
    };

    const degradation = 0.5; // [%/year]
    const yieldValue = device.yield_value || 1000; // [kWh/kW]
    const capacity = device.capacity; // Kw

    const commissioningDate = DateTime.fromISO(device.commissioning_date);
    const currentDate = DateTime.fromISO(new Date().toISOString());
    const deviceAge = Math.round(
      currentDate.diff(commissioningDate, ['years']).toObject()?.years,
    ); // years

    const currentRead = DateTime.fromISO(read.timestamp.toISOString());
    const lastRead = DateTime.fromISO(final.timestamp.toISOString());
    const meteredTimePeriod = Math.round(
      currentRead.diff(lastRead, ['hours']).toObject()?.hours,
    ); // years

    const margin = 0.2; // Margin for comparing read value with computed max energy

    const maxEnergy = computeMaxEnergy(
      capacity,
      meteredTimePeriod,
      deviceAge,
      degradation,
      yieldValue,
    );

    const readValue = Math.round(read.value * 10 ** 3); // Convert from W to kW
    return readValue + margin * readValue < maxEnergy;
  }
}
